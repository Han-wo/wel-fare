---
name: rag-trace-debug
description: 특정 채팅 세션 또는 traceId의 RAG 파이프라인 실행 흐름을 재구성해서 "왜 이런 답변이 나왔는지"를 사람이 읽을 수 있는 서사로 설명합니다. 사용자가 "이 세션 왜 이렇게 답했지", "라우팅 왜 이렇게 됐어", "디버그 해줘", "trace 분석", "세션 추적"을 요청할 때 트리거.
---

# /rag-trace-debug

이 프로젝트의 RAG는 `rag_traces` 테이블에 세션별 실행 이력을 남깁니다. 이 스킬은 그 트레이스를 해독해 사람이 이해 가능한 실행 서사로 풀어냅니다.

## 입력 해석

사용자는 다음 중 하나를 주거나 말로 지칭합니다:
- `traceId` (UUID) — 가장 정확
- `sessionId` (UUID) — 해당 세션의 최근 트레이스
- 시간대 + 키워드("오늘 오후 청약 질문")
- 아무것도 안 줌 → 최근 N개 트레이스 목록 요청

어떤 입력이든 다음 우선순위로 데이터에 접근합니다:
1. **관리자 API** (백엔드가 떠 있으면): `GET /admin/traces?limit=20` 또는 `/admin/traces/:id` — `rag-trace.admin.controller.ts`. ADMIN 토큰 필요.
2. **DB 직접**: PostgreSQL `rag_traces` 테이블. 스키마는 `apps/api/src/modules/rag/entities/rag-trace.entity.ts` 참조.

## 핵심 스키마 (RagTrace)

- `status`: `RUNNING | SUCCESS | FAILED | ABORTED`
- `routeType`: `SEARCH | ELIGIBILITY | APPLICATION_ASSIST` (최상위 그래프 선택)
- `toolNames[]`: 실행된 tool들 (SEARCH 그래프의 ReAct 도구들)
- `events[]` — **타임라인의 핵심**. 각 이벤트의 `type`은 다음 중 하나:
  - `session` — 세션 시작/컨텍스트 초기화
  - `context` — 프로필, 대화 이력 수
  - `decision` — 라우팅, pre-route, clarification 등 의사결정
  - `vector_search` — Qdrant 검색 (query + hits + scores + filter)
  - `graph_walk` — Neo4j/정책 그래프 순회
  - `answer` — 최종 답변 저장
  - `error` — 예외
- `graph`: `{nodes, edges}` — 프론트엔드 시각화용 누적 그래프

어떤 이벤트가 어떤 메서드로 기록되는지는 `trace-facade.service.ts` 참조 (`recordContext`, `recordToolSelection`, `recordVectorSearch`, `recordGraphWalk`, `recordAnswer`, `recordError`).

## 재구성 절차 (체크리스트)

트레이스 하나를 받으면 다음 순서로 서사를 만드세요:

1. **헤더** — `question`, `status`, `routeType`, `durationMs`, `toolNames`.
2. **컨텍스트** — `events` 중 `type=context` 찾아 `historyCount`, `profileSummary` 요약.
3. **라우팅 결정** — `type=decision` 이벤트 중 가장 이른 것. `query-analysis.service.ts`의 `resolveRoute` 또는 `resolveSearchPreRoute` 결과. regex 매칭 근거를 함께 언급 ("ELIGIBILITY_INTENT regex가 '받을 수 있' 매치").
4. **Clarification 분기 여부** — missing fields로 인한 조기 종료가 있었는지. 있으면 어떤 필드가 비어 있었는지 명시 (`query-analysis.service.ts`의 `getClarificationRequest`).
5. **Retrieval** — `vector_search` / `graph_walk` 이벤트들. 각각의 hit 수, top score, 사용된 filter. **empty retrieval이면 강조**.
6. **HITL 트리거 여부** — `hitl-detection.ts`의 3가지 이유 중 어느 것에 걸렸는지: `empty_answer`, `uncertain_phrasing`, `reasking_with_options`. HITL가 떴다면 저장된 답변(`answer`)이 없을 수 있음 — `skipSave` 패턴 참고.
7. **최종 답변** — `answer` 필드 + 답변 생성 시 쓰인 retrieval 근거 매칭.
8. **이상 플래그** — 다음 중 하나라도 해당되면 별도 섹션으로 경고:
   - `duration_ms > 15000`
   - `events` 중 `error` 존재
   - `vector_search`의 모든 hit score가 낮음 (`< 0.5`)
   - `routeType`과 실제 실행된 tool이 어긋남 (예: ELIGIBILITY로 갔는데 deadline tool 호출)
   - HITL 연속 발생 (대화 컨텍스트에서 직전 턴도 HITL)

## 조회 예시

관리자 API가 살아있는 환경에서:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_BASE/admin/traces?sessionId=<SESSION_UUID>" | jq
```

로컬 DB 직접 조회:
```sql
SELECT id, session_id, question, status, route_type, tool_names,
       duration_ms, started_at, jsonb_array_length(events) AS event_count
FROM rag_traces
WHERE session_id = '<UUID>'
ORDER BY started_at DESC
LIMIT 5;

-- 이벤트 펼치기
SELECT jsonb_pretty(events) FROM rag_traces WHERE id = '<TRACE_UUID>';
```

## 출력 포맷

사용자에게 돌려줄 때는 마크다운 섹션으로:

```
## 세션 <id 앞 8자>
- 질문: "..."
- 상태: SUCCESS (duration 3.2s)
- 라우팅: ELIGIBILITY → 근거: "받을 수 있" regex 매치

## 흐름
1. [context] history 4턴, 프로필 {age: 28, income: ...}
2. [decision] ELIGIBILITY 그래프로 라우팅
3. [vector_search] query="청년 월세 지원", hits=5, top_score=0.82
4. [graph_walk] 정책 관계 2노드 확장
5. [answer] "청년월세지원 대상에 해당합니다..."

## 이상 플래그
- 없음 (또는) ⚠ HITL 3번 연속, uncertain_phrasing으로 재질문
```

길이는 트레이스 하나당 30줄 이내 유지. 이벤트가 많으면 vector_search/graph_walk는 상위 3건만.

## 주의

- `events`는 JSONB 배열이므로 순서는 `at` 타임스탬프 기준으로 재정렬하지 말 것 (이미 삽입 순서대로 저장됨).
- 민감정보(주민번호 패턴, 전화번호)가 `question`이나 `payload`에 있을 수 있음 — 마스킹해서 보여주기.
- 사용자가 "최근 거" 라고만 하면 최근 10건 목록부터 제시하고 고르게 할 것. 곧바로 한 건 추측 금지.
