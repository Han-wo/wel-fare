---
name: scaffold-rag-graph
description: 새 LangGraph StateGraph(예 rag/eligibility/application-assist 같은 추가 워크플로우)를 기존 3개 그래프의 공통 골격대로 스캐폴딩합니다. state annotation, streaming/HITL 콜백, trace 훅, saveMessage 가드를 빠뜨리지 않도록 체크리스트로 유도. 사용자가 "새 그래프 만들어줘", "워크플로우 추가", "advice 그래프 추가", "RAG route 하나 더 붙이자"를 요청할 때 트리거.
---

# /scaffold-rag-graph

이 프로젝트의 RAG 그래프(`rag.graph.ts` / `eligibility.graph.ts` / `application-assist.graph.ts`)는 **동일한 골격**을 공유합니다. 새 워크플로우 그래프를 추가할 때 이 골격을 어긋나게 박으면 trace가 비거나, HITL가 폭주하거나, 답변이 DB에 두 번 저장되는 등 조용히 깨지는 유형의 버그가 납니다. 이 스킬은 그 골격을 체크리스트로 박아줍니다.

## 시작 전에 반드시 할 것

1. 사용자에게 **새 그래프의 이름과 목적**을 확인. 예: `advice` (맞춤 조언), `notification` (알림 요약).
2. `RagRouteType`은 현재 `SEARCH | ELIGIBILITY | APPLICATION_ASSIST` 세 값. 새 라우트를 추가하는 건지, 기존 라우트 안의 서브그래프를 빼는 건지 구분.
3. **항상 레퍼런스 파일 먼저 읽기** — 골격이 시간에 따라 변하므로 이 스킬의 코드 조각을 맹목적으로 복붙하지 말 것:
   - `apps/api/src/modules/rag/eligibility.graph.ts` — 가장 깔끔한 레퍼런스 (중간 복잡도)
   - `apps/api/src/modules/rag/application-assist.graph.ts` — HITL 자동탐지 분기 포함
   - `apps/api/src/modules/rag/rag.graph.ts` — ReAct agent + tool loop (복잡한 예)
   - `apps/api/src/modules/rag/rag-orchestrator.service.ts` — 그래프를 어떻게 등록/디스패치하는지
   - `apps/api/src/modules/rag/streaming.service.ts` — 스트리밍 래핑 계약

## 공통 골격 (2026-04 기준)

### 1. State Annotation

`rag.graph.ts:28-45` 패턴. **반드시 포함해야 하는 필드:**

```ts
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (x, y) => x.concat(y), default: () => [] }),
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  traceId: Annotation<string>(),
  profile: Annotation<UserProfile | null>(),
  answer: Annotation<string>(),
  skipSave: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  streamCallback: Annotation<((token: string) => void) | null>(),
  hitlCallback: Annotation<((payload: HitlQuestionnaire) => void) | null>(),
  // 그래프별 고유 필드는 아래에
});
```

`skipSave`를 빠뜨리면 HITL 분기에서 빈 답변이 저장됩니다. `reducer`는 `(current, next) => next` 형태여야 (기본 merge는 bool에 안 맞음).

### 2. 팩토리 함수 시그니처

```ts
export function createXxxGraph(services: RagGraphServices) {
  // 노드 함수들 클로저에서 services 사용
  return new StateGraph(GraphState)
    .addNode(...)
    .addEdge(START, '<첫 노드>')
    ...
    .addEdge('save_message', END)
    .compile();
}
```

`RagGraphServices` 타입은 `rag.graph.ts`에 선언돼 있음. 새 그래프에서 기존 필드로 부족하면 타입 확장 필요 (보통 `Pick<>` 확장).

### 3. 필수 노드 패턴

레퍼런스 그래프들은 공통적으로 다음 6개 노드를 가짐:

| 노드 | 책임 | 주의점 |
|---|---|---|
| `load_context` | history, profile 로드 + `services.recordContext(traceId, {historyCount, profileSummary})` | trace 기록 빠뜨리지 말 것 |
| `request_missing_info` | `queryAnalysis.getClarificationRequest` 호출. 부족 필드 있으면 `answer = prompt`로 조기 종료 | `skipSave: false` 명시 |
| `collect_*_context` | retrieval — vector search + graph walk. `services.recordEvent(...)` | 빈 결과 시 fallback 답변 생성 후 조기 종료 |
| `generate_answer` | LLM 호출. `state.streamCallback?.(token)` per-token 호출 | chunks 비면 fallback 메시지 + `skipSave: false` |
| `verify_answer` | `detectAnswerNeedsHitl(answer)` → HITL 필요하면 `hitlCallback(questionnaire)` + `return { skipSave: true }` | **HITL 분기 시 반드시 skipSave: true** |
| `save_message` | `if (sessionId && answer && !skipSave) services.saveMessage(...)` | 가드 3개 다 있어야 함 |

### 4. 조건부 라우팅

```ts
.addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
  answered: END,          // 부족 필드가 있어서 답변 생성 없이 종료
  proceed: 'collect_xxx',
})
.addConditionalEdges('collect_xxx', routeAfterContext, {
  no_context: 'save_message',  // retrieval 비어서 fallback 답변으로 바로 저장 단계
  generate: 'generate_answer',
})
```

함수 시그니처:
```ts
function routeAfterMissingInfo(state: GraphStateType): 'answered' | 'proceed' {
  return state.answer ? 'answered' : 'proceed';
}
```

### 5. Streaming 연결

streamCallback 호출 지점:
```ts
const stream = await chatModel.stream(messages);
for await (const chunk of stream) {
  const token = extractText(chunk);
  if (token) {
    state.streamCallback?.(token);
    chunks.push(chunk);
  }
}
```

Orchestrator가 `streamCallback`에 `pushText`를 주입합니다 (`rag-orchestrator.service.ts` 참조).

### 6. HITL 자동탐지 (선택)

`application-assist.graph.ts:370` 패턴:
```ts
async function verifyAnswer(state): Promise<Partial<State>> {
  const detection = detectAnswerNeedsHitl(state.answer);
  if (!detection.needsHitl) return {};

  const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({...});
  state.hitlCallback?.(questionnaire);
  services.recordEvent(state.traceId, {
    type: 'decision',
    title: 'HITL questionnaire 발행',
    payload: { detectionReason: detection.reason, questionnaireId: questionnaire.id },
  });
  return { skipSave: true };  // ← 반드시
}
```

### 7. Orchestrator / 라우트 타입 수정

새 라우트 값을 추가하는 경우:

1. `query-analysis.service.ts`의 `RagRouteType` 유니온에 값 추가
2. 필요하면 `resolveRoute`에 새 intent regex 분기 추가 (+ `/audit-ko-patterns` 스킬로 검증)
3. `rag-orchestrator.service.ts`:
   - import `createXxxGraph`
   - 인스턴스 필드 `private readonly xxxGraph: ReturnType<typeof createXxxGraph>` 추가
   - 생성자에서 `this.xxxGraph = createXxxGraph(services)`
   - `getGraphForRoute(routeType)` switch에 분기 추가

## 스캐폴딩 산출물

사용자가 그래프 추가를 요청하면 다음을 순서대로 만드세요:

1. **`apps/api/src/modules/rag/xxx.graph.ts`** — 위 골격 따라 작성. 그래프별 고유 노드/필드 포함.
2. **`apps/api/src/modules/rag/xxx.graph.spec.ts`** (선택) — `createXxxGraph(mockServices)` 호출하고 `invoke(input)` 결과 검증하는 최소 테스트.
3. **`rag-orchestrator.service.ts` 패치** — 위 7번 항목.
4. **`query-analysis.service.ts` 패치** — 새 라우트 값 + regex (필요시).

## 최종 체크리스트 (커밋 전에 반드시 확인)

- [ ] `GraphState`에 `skipSave` 포함, reducer/default 올바름
- [ ] `streamCallback`, `hitlCallback` state 필드 포함
- [ ] 모든 early return에 `skipSave: false` 명시 (HITL 분기만 `true`)
- [ ] `saveMessage` 노드에 `if (sessionId && answer && !skipSave)` 가드
- [ ] `load_context`에서 `recordContext` 호출
- [ ] retrieval 노드에서 `recordEvent({type: 'vector_search' | 'graph_walk', ...})` 호출
- [ ] `generate_answer`에서 `state.streamCallback?.(token)` per-token 호출
- [ ] HITL 분기 시 `hitlCallback` 호출 + `{ skipSave: true }` return
- [ ] Orchestrator에 인스턴스 등록 및 `getGraphForRoute` 분기 추가
- [ ] `RagRouteType` 유니온에 새 값 추가 (신규 라우트인 경우)
- [ ] `pnpm --filter @welfare-ai/api build` 통과

## 주의

- LangGraph 버전이 바뀌면 API가 달라질 수 있음. `@langchain/langgraph` 버전 확인 (`package.json`).
- 기존 그래프를 "복사해서 이름만 바꾸기"는 **하지 말 것**. 책임이 다르면 필요한 retrieval 소스/HITL 정책도 다름. 뼈대만 따오고 내용은 새로 설계.
- 사용자가 "일단 뼈대만"이라고 하면 retrieval/generate는 TODO 주석으로 두고 state/edge 토폴로지만 완성해서 빌드가 통과하게 할 것.
