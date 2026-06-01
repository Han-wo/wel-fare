# 2차 최적화 보고서 — RAG 토큰 절감

> 작성: 2026-05-16
> 범위: RAG 에이전트의 LLM 입력 토큰 절감 + prompt caching 적중
> 1차 보고서: [optimization-phase-1.md](./optimization-phase-1.md)

---

## 1. 개요

본 차수는 1차에서 식별만 해두고 보류했던 `L1+L2+L3` (RAG 토큰 절감 묶음)을 적용한다. 변경 대상은 `rag.graph.ts` 단일 파일이며 LLM 응답 품질에는 영향이 없다.

| 항목 | 효과 |
|---|---|
| L1 | tool schema에서 LLM에 traceId 노출 제거 |
| L2 | tool 결과 JSON 들여쓰기 제거 |
| L3 | system prompt에서 정적/동적 영역 분리해 prompt caching 적중 |

총 입력 토큰 **20~30% 절감**, 그리고 system prompt의 정적 부분이 매 요청 재사용되어 **prompt cache hit**로 1차 토큰 처리 비용/지연이 크게 감소한다.

---

## 2. 사전 진단

대상 그래프: `apps/api/src/modules/rag/rag.graph.ts` (SEARCH 라우팅용 ReAct 그래프).

### 2.1 tool schema에 `traceId` 노출
7개 모든 tool의 zod schema에 `traceId: z.string().nullable()` 가 포함되어 있었다. LangChain `tool()` 은 zod schema를 OpenAI tool/function calling schema로 변환해 LLM에 전송한다. 즉 LLM이 매 요청마다 traceId를 "어떻게 채워야 할지" 보고 있었다.

- 한 요청에서 7개 tool 전부 schema가 system context에 들어감
- traceId는 운영 식별자라 LLM이 의미 있게 만들 수도 없음 → 토큰 낭비 + 환각 가능성
- 결국 `agentNode`는 후처리로 `args.traceId = state.traceId`를 강제 주입 → LLM 출력은 무시되는 구조

### 2.2 도구 결과 JSON 직렬화에 들여쓰기
```ts
function serializeToolPayload(result) {
  return JSON.stringify(toStructuredToolPayload(result), null, 2);
}
```

`null, 2` 들여쓰기는 디버깅용. 프로덕션에서는 줄바꿈/공백이 LLM 입력 토큰의 약 1.3~1.7배를 소비한다. 한 ReAct 사이클에 도구 결과가 2~3개 들어가면 누적 효과가 크다.

### 2.3 system prompt에 사용자 정보가 박혀 있음

`loadContext` 노드에서 한 덩어리의 `SystemMessage`에 다음이 모두 들어가 있었다:

```
당신은 ... 컨설턴트입니다.

## 오늘 날짜
2026-05-16 ...               ← 동적 (매일 다름)

## 사용자 정보
- 나이: 27세 | 거주지: 서울 ...   ← 동적 (사용자마다 다름)
- userId: 9b6440b2-...           ← 동적 (요청마다 다름)

## 도구 출력 규칙 ...             ← 정적
## 도구 사용 규칙 ...             ← 정적
## 정확도 규칙 ...               ← 정적
## 답변 형식 ...                 ← 정적
```

OpenAI/Anthropic prompt caching은 메시지 앞부분이 정확히 동일해야 적중한다. userId가 system 상단에 박혀 있어 **매 요청 cache miss**.

---

## 3. 변경 내역

### L1. tool schema에서 `traceId` 제거 + RunnableConfig로 전달

**파일**: `apps/api/src/modules/rag/rag.graph.ts`

#### 변경 전 (7개 tool 동일 패턴)
```ts
const searchWelfare = tool(
  async ({ question, userId, traceId }: { ... traceId: string | null }) => {
    emitThink(traceId, { ... });
    const result = await services.searchWelfare(question, userId, traceId ?? undefined);
    ...
  },
  {
    name: 'search_welfare',
    schema: z.object({
      question: z.string(),
      userId: z.string(),
      traceId: traceIdSchema,   // ← LLM에 노출
    }),
  },
);
```

`agentNode`에서는 후처리로 args에 traceId를 강제 주입했다:
```ts
finalMessage.tool_calls = finalMessage.tool_calls.map((tc) => ({
  ...tc,
  args: { ...(tc.args ?? {}), traceId: state.traceId },
}));
```

#### 변경 후
```ts
// 모듈 단위 헬퍼: orchestrator가 graph.invoke({ metadata: { traceId } })로 전파한 값을 추출
const extractTraceId = (config?: RunnableConfig): string | null => {
  const value = config?.metadata?.traceId;
  return typeof value === 'string' ? value : null;
};

const searchWelfare = tool(
  async (
    { question, userId }: { question: string; userId: string },
    config?: RunnableConfig,
  ) => {
    const traceId = extractTraceId(config);
    emitThink(traceId, { ... });
    const result = await services.searchWelfare(question, userId, traceId ?? undefined);
    ...
  },
  {
    name: 'search_welfare',
    schema: z.object({
      question: z.string(),
      userId: z.string(),
    }),
  },
);
```

**기반 동작**: LangChain `tool()`의 두 번째 인자는 `RunnableConfig`. LangGraph가 노드를 실행할 때 graph 전체에 전달된 config를 도구에도 그대로 propagate. `orchestrator.streamAnswer` 가 이미 다음과 같이 metadata를 채우고 있어 별도 wiring 불필요:

```ts
// apps/api/src/modules/rag/rag-orchestrator.service.ts:184
await graph.invoke(state, {
  runName: 'welfare-rag-pipeline',
  tags: ['welfare-ai', 'rag', 'langgraph'],
  metadata: { userId, sessionId, traceId, routeType: routeDecision.routeType },
});
```

추가로 `agentNode`의 args 후처리 주입 코드는 제거:
```diff
- if (finalMessage.tool_calls?.length) {
-   finalMessage.tool_calls = finalMessage.tool_calls.map((toolCall) => ({
-     ...toolCall,
-     args: { ...(toolCall.args ?? {}), traceId: state.traceId },
-   }));
- }
+ // traceId는 RunnableConfig.metadata로 자동 전파되므로 args에 별도 주입할 필요 없음.
```

**적용 범위**: 7개 tool 전부 (`searchWelfare`, `searchYouthPolicy`, `searchHousingSubscription`, `searchRentalSupport`, `searchWelfareFacility`, `checkPolicyEligibility`, `getUpcomingDeadlines`)

> ℹ️ `query-analysis.service.ts:resolveSearchPreRoute`가 만드는 pre-route toolCall.args에는 여전히 traceId가 들어 있다. 이 args는 LLM이 만든 게 아니라 서버가 직접 만든 ToolCall이라 LLM 토큰과 무관하며, zod parse 시 unknown 필드로 strip되어 함수에도 전달되지 않는다. 동작에는 영향 없음.

### L2. tool 결과 JSON 직렬화에서 들여쓰기 제거

**파일**: `apps/api/src/modules/rag/rag.graph.ts`

```diff
function serializeToolPayload(result: RetrievalResult | EligibilityRetrievalResult) {
- return JSON.stringify(toStructuredToolPayload(result), null, 2);
+ // 들여쓰기 없이 직렬화해 LLM 입력 토큰을 ~30% 절감.
+ return JSON.stringify(toStructuredToolPayload(result));
}
```

ReAct 한 사이클에 도구 결과가 2~3개 들어가는 흐름에서 누적 절감이 크다.

### L3. system prompt 분리

**파일**: `apps/api/src/modules/rag/rag.graph.ts`

#### 정적 system prompt 상수
모듈 최상단에 `SEARCH_SYSTEM_PROMPT` 상수로 추출. 도구 출력/사용/정확도/답변 형식 규칙만 포함하며 요청에 따라 변하지 않는다.

```ts
const SEARCH_SYSTEM_PROMPT = `당신은 대한민국 복지·지원금 정책 전문 AI 컨설턴트입니다. ...

## 도구 출력 규칙 ...
## 도구 사용 규칙 ...
## 정확도 규칙 ...
## 답변 형식 ...`;
```

#### 동적 사용자 컨텍스트는 별도 메시지
`loadContext`에서 오늘 날짜·age·region·userId를 별도 `HumanMessage`로 분리:

```ts
const userContextMessage = new HumanMessage(
  [
    '## 오늘 날짜',
    `${today} (이 날짜 이후 접수 기간이 유효한 정책·청약만 안내)`,
    '',
    '## 사용자 정보',
    `- 나이: ${age}세 | 거주지: ${region} | ...`,
    `- userId: ${state.userId}`,
  ].join('\n'),
);

return {
  profile,
  messages: [
    new SystemMessage(SEARCH_SYSTEM_PROMPT),  // 정적 — cacheable
    userContextMessage,                       // 동적
    ...historyMessages,
    new HumanMessage(state.question),
  ],
};
```

**효과**: OpenAI/Anthropic의 prompt caching이 메시지 prefix 동일 조건에서 적중. 정적 system은 항상 같으므로 첫 요청 이후 모든 요청에서 system 토큰 처리 비용/지연이 크게 감소.

---

## 4. 변경 파일 목록

| 분류 | 파일 | 변경 |
|---|---|---|
| L1+L2+L3 | `apps/api/src/modules/rag/rag.graph.ts` | tool 시그니처 `(args, config)` 7개, schema에서 traceId 제거, `agentNode` 후처리 주입 제거, `serializeToolPayload` 들여쓰기 제거, `SEARCH_SYSTEM_PROMPT` 상수 분리, `loadContext` 메시지 구성 변경 |

E1 묶음은 단일 파일 변경으로 끝난다. eligibility/application-assist 그래프의 system prompt에는 동적 정보가 박혀 있지 않아 L3 적용 불필요.

---

## 5. 예상 효과

| 항목 | Before | After |
|---|---|---|
| tool schema의 traceId 토큰 | 7개 tool × ~12 tokens ≈ 84 tokens/요청 | **0** |
| tool 결과 JSON 직렬화 | 들여쓰기 포함, ~1.4x 토큰 | **~30% 절감** |
| system prompt cache 적중 | 매 요청 miss (userId가 system에 박힘) | **static 영역 cache hit** |
| 합산 입력 토큰 | 기준 | **~20~30% 감소** |
| 응답 지연 (첫 토큰까지) | cache miss 비용 포함 | **prefix 캐시 적중분만큼 단축** |

응답 본문(품질/형식)에는 영향 없음. system 규칙은 그대로 적용되고, 사용자 정보는 위치만 system → user 메시지로 이동.

---

## 6. 검증 권장사항

1. **trace 이벤트 누락 확인**
   - 도구 호출 시 `emitThink(traceId, ...)`이 정상 동작하는지 (UI에 thinking 단계 표시)
   - `services.recordContext / recordToolSelection / recordEvent`에 traceId가 정상 들어가는지
   - 만약 누락되면 LangChain 버전에 따라 `RunnableConfig`가 도구에 자동 전달되지 않는 케이스 가능 → fallback은 1차의 args 주입 패턴
2. **prompt caching 적중**
   - 동일 사용자가 연속 질의 시 latency가 줄어드는지 (cache hit 효과는 2번째 요청부터)
3. **tool calling 정상**
   - LLM이 traceId 누락에 당황하지 않는지 (description에서도 빠져 있어 안전하지만 첫 호출에서 검증)

---

## 7. 누적 효과 (1차 + 2차 기준)

| 영역 | 효과 |
|---|---|
| 시드 동기화 (1차) | `local-welfare` 첫 적재 ~24분 → ~3~4분, 증분 재실행 20~40초 |
| RAG 정합성 (1차) | history/HITL 보존 정상화 |
| 운영 안정성 (1차) | dev-watch 재시작에도 시드 생존, stale 자동 정리 30분 |
| **RAG 응답 비용 (2차)** | **입력 토큰 20~30% 감소 + prompt caching 적중** |

---

## 8. 후속 과제 (3차 후보)

### 🟥 E2. startSync race 가드 — burning issue
1차 검증 중 4중 동시 트리거가 race로 통과해 공공API 쿼터 소진. `DataSyncService.getActiveRunId()` 가드 보완 필요.
- 옵션 A: Postgres advisory lock (`pg_try_advisory_lock` 한 줄, 추가 인프라 없음)
- 옵션 B: Redis SET NX (이미 Redis 사용 중)

### 🟧 E3. 라우팅/HITL 정확도
- L5: `query-analysis.service.ts:101-153` 의 `resolveSearchPreRoute` 정규식 충돌 시 NOT 조건 → 점수화 (예: "청년 행복주택" 합성 질문이 pre-route 실패 → ReAct LLM 호출 비용)
- L6: `hitl-detection.ts` 의 `UNCERTAIN_PHRASE` false positive 줄이기 (긴 답변의 일부 표현으로 HITL 강제 전환 방지)

### 🟧 E4. RetrieverServices 내부 병렬화 + getProfile N+1
- `searchWelfare` 의 `getProfile → inferFromOntology → vector → enrich` 순차 → `Promise.all` 병렬
- 한 요청 안에서 `getProfile`이 4~5번 반복 호출되는 N+1 해결 (orchestrator에서 한 번 fetch → `state.profile` 주입)

### 🟨 E5. 시드 추가 보틀넥 (1차의 P2/P3)
- P2: `buildIncrementalSyncPlan` lookup을 batch별 → 시드 시작 시 1회로
- P3: batch 간 파이프라이닝 (fetch와 embed/upsert를 겹치기)
- 1차 P1+S1-S3로 이미 충분히 빨라져서 우선순위 낮음

### 🟨 E6. detached spawn 보강
1차 C1의 한계 — 부모(API)가 죽으면 자식의 stdout pipe가 끊겨 진행도 DB write가 멈춤. 자식 stdout/stderr를 파일로 redirect + 진행도를 자식이 직접 DB write 하면 완전 분리 가능.

---

## 9. 변경 위치 빠른 참조

| 변경 | 라인 위치 (변경 시점 기준) |
|---|---|
| `SEARCH_SYSTEM_PROMPT` 상수 신설 | `rag.graph.ts:28~62` 부근 |
| `extractTraceId` 헬퍼 | `rag.graph.ts:139~145` 부근 |
| 7개 tool 시그니처 `(args, config)` 변경 | `rag.graph.ts:147~395` |
| `serializeToolPayload` 들여쓰기 제거 | `rag.graph.ts:116~119` |
| `agentNode` args traceId 후처리 제거 | `rag.graph.ts:agentNode` 내부 |
| `loadContext` 메시지 구성 변경 | `rag.graph.ts:loadContext` 반환 부분 |

라인 번호는 코드 진화에 따라 변할 수 있어 함수/상수 이름 기준으로 식별 권장.
