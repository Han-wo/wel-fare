# WelfareAI Current RAG Architecture

기준일: 2026-03-19

이 문서는 현재 실제 코드 기준의 백엔드 RAG 아키텍처를 설명한다.  
기존 [architecture.md](./architecture.md)는 제품/시스템 기획 문서이고, 이 문서는 현재 구현 상태를 기준으로 한다.

## 1. 핵심 요약

- 프론트엔드: Next.js 15
- 백엔드: NestJS 11
- 오케스트레이션: LangGraph + LangChain
- LLM: OpenAI Chat 모델
- 벡터 검색: Qdrant
- 그래프 검색: Neo4j
- 영속 저장: PostgreSQL
- 런타임 세션 상태: PostgreSQL + Redis
- 추적/디버깅: PostgreSQL `rag_traces` + 관리자 추적 UI

현재 구조는 하나의 거대한 RAG 서비스가 아니라 아래 계층으로 분리되어 있다.

- 진입 계층
  - `RagController`
  - `RagService`
- 오케스트레이션 계층
  - `RagOrchestratorService`
  - `StreamingService`
  - `QueryAnalysisService`
- Retrieval 계층
  - `RetrieverServices`
  - `VectorRetrievalService`
  - `PolicyGraphService`
  - `HousingGraphService`
  - `SuggestionService`
- 추적 계층
  - `TraceFacade`
  - `RagTraceService`
  - `PolicyTraceMapper`
  - `GraphTraceMapper`
- 채팅 런타임 계층
  - `ChatRuntimeService`

## 2. 시스템 구조

시스템 전체 구조 다이어그램은 [current-system-architecture.mmd](./current-system-architecture.mmd)에 있다.

핵심 흐름은 다음과 같다.

1. 웹 클라이언트가 `/api/v1/rag/stream`에 질문과 `sessionId`를 보낸다.
2. `RagController`가 SSE 스트림을 연다.
3. `RagService`는 얇은 façade로서 `RagOrchestratorService`에 위임한다.
4. `RagOrchestratorService`는
   - 세션 소유권 확인
   - trace 시작
   - 질문 라우팅
   - 적절한 LangGraph 선택
   - `StreamingService`를 통한 SSE 이벤트 송출
   를 담당한다.
5. 각 그래프는 `RetrieverServices`를 통해 벡터/그래프/RDB 데이터를 조회한다.
6. 생성된 응답은 `chat_messages`에 저장되고, trace는 `rag_traces`에 지속 저장된다.

## 3. RAG 라우팅 구조

현재 질문은 3가지 route로 분기된다.

- `SEARCH`
  - 일반 검색형 질문
  - 하이브리드 ReAct Tool Calling 그래프 사용
- `ELIGIBILITY`
  - “받을 수 있나”, “자격이 되나”, “조건이 맞나” 류
  - 고정 workflow 그래프 사용
- `APPLICATION_ASSIST`
  - “신청 방법”, “준비 서류”, “다음 단계” 류
  - 고정 workflow 그래프 사용

라우팅과 추가 정보 요청은 [QueryAnalysisService](../apps/api/src/modules/rag/query-analysis.service.ts)가 담당한다.

이 서비스는 아래 책임을 가진다.

- 질문 route 결정
- `SEARCH`용 pre-route 규칙 결정
- `APPLICATION_ASSIST`용 source 선택
- 질문/프로필만으로 정확도가 부족할 때만 HITL 추가 정보 요청

## 4. 에이전트 구조

“에이전트”라는 표현은 현재 구현에서는 `여러 개의 그래프 기반 실행 경로`를 의미한다.  
즉, 범용 멀티 에이전트 시스템이 아니라 `route별 전용 LangGraph` 구조다.

### 4.1 Search Graph

파일:

- [rag.graph.ts](../apps/api/src/modules/rag/rag.graph.ts)

특징:

- LangGraph `StateGraph`
- LangChain `ToolNode`
- OpenAI tool calling 기반
- 검색형 질문에 대해 pre-route 규칙 우선 적용
- 필요 시 LLM이 tool call을 추가 실행
- tool 결과는 구조화 데이터로 관리되고, LLM 경계에서만 prompt block으로 직렬화

실행 흐름:

1. 컨텍스트 로드
2. 추가 정보 필요 여부 판단
3. pre-route 규칙 검사
4. ReAct tool calling loop
5. 응답 생성
6. 응답 저장

### 4.2 Eligibility Graph

파일:

- [eligibility.graph.ts](../apps/api/src/modules/rag/eligibility.graph.ts)

특징:

- 특정 정책/지원의 적격 가능성 판단 전용 workflow
- 자유로운 tool calling보다 절차형 판정에 집중

실행 흐름:

1. 컨텍스트 로드
2. 추가 정보 필요 여부 판단
3. 정책 적격성 자료 수집
4. LLM 판정/정리
5. 응답 저장

### 4.3 Application Assist Graph

파일:

- [application-assist.graph.ts](../apps/api/src/modules/rag/application-assist.graph.ts)

특징:

- 신청 절차/서류/링크/다음 단계 안내 전용 workflow
- 질문 유형에 따라 여러 source를 선택해 자료를 합친다

실행 흐름:

1. 컨텍스트 로드
2. 추가 정보 필요 여부 판단
3. source 선택
4. 다중 retrieval
5. 신청 가이드 생성
6. 응답 저장

RAG/에이전트 실행 흐름 다이어그램은 [current-rag-agent-flow.mmd](./current-rag-agent-flow.mmd)에 있다.

## 5. 서비스 책임 분리

### 5.1 진입/오케스트레이션

- [RagService](../apps/api/src/modules/rag/rag.service.ts)
  - 얇은 façade
  - 외부 API에서 직접 호출되는 entry point

- [RagOrchestratorService](../apps/api/src/modules/rag/rag-orchestrator.service.ts)
  - 세션 ownership 확인
  - trace 시작/종료
  - route별 graph 선택
  - streaming 실행
  - 사용자/assistant 메시지 저장

- [StreamingService](../apps/api/src/modules/rag/streaming.service.ts)
  - SSE 이벤트 lifecycle 관리
  - `SESSION_CREATED`, `THINK`, `TOKEN`, `DONE` 흐름 처리
  - stream abort / close 처리

### 5.2 Retrieval

- [RetrieverServices](../apps/api/src/modules/rag/retriever-services.service.ts)
  - 상위 조합 façade
  - profile 조회 + domain retriever 결합

- [VectorRetrievalService](../apps/api/src/modules/rag/vector-retrieval.service.ts)
  - Qdrant 검색
  - 임베딩 생성
  - vector trace 기록

- [PolicyGraphService](../apps/api/src/modules/rag/policy-graph.service.ts)
  - 정책 후보 추론
  - 정책 관계 확장
  - 정책명 suggestion 조회

- [HousingGraphService](../apps/api/src/modules/rag/housing-graph.service.ts)
  - 청약 공고 조회
  - 임대단지 조회
  - 마감 임박 공고 조회

- [SuggestionService](../apps/api/src/modules/rag/suggestion.service.ts)
  - 사용자 프로필 기준 추천 질문 생성

### 5.3 Trace

- [TraceFacade](../apps/api/src/modules/rag/trace-facade.service.ts)
  - trace 호출 entry façade

- [RagTraceService](../apps/api/src/modules/rag/rag-trace.service.ts)
  - trace draft 관리
  - 이벤트/노드/엣지 지속 저장
  - 관리자 trace 조회 API backing service

- [PolicyTraceMapper](../apps/api/src/modules/rag/policy-trace-mapper.ts)
  - 정책 그래프 결과를 관리자 시각화용 node/edge로 변환

- [GraphTraceMapper](../apps/api/src/modules/rag/graph-trace-mapper.ts)
  - 주거 그래프 결과를 관리자 시각화용 node/edge로 변환

## 6. 구조화된 Retrieval 계약

현재 tool 결과는 내부적으로 문자열이 아니라 구조화된 계약을 쓴다.

파일:

- [retrieval.types.ts](../apps/api/src/modules/rag/retrieval.types.ts)

핵심 타입:

- `RetrievalItem`
- `RetrievalResult`
- `EligibilityRetrievalResult`

핵심 원칙:

1. retrieval 단계에서는 구조화 데이터 유지
2. LLM 프롬프트 경계에서만 `retrievalResultToPromptBlock()`으로 문자열 직렬화
3. 관리자 trace와 후처리는 구조화 payload를 기준으로 처리

## 7. 세션과 스트리밍 런타임

파일:

- [chat-runtime.service.ts](../apps/api/src/modules/chat/chat-runtime.service.ts)
- [chat-session.entity.ts](../apps/api/src/modules/chat/entities/chat-session.entity.ts)
- [20260319000100-add-chat-session-runtime-columns.ts](../apps/api/src/database/migrations/20260319000100-add-chat-session-runtime-columns.ts)

현재 구조:

- PostgreSQL
  - authoritative session runtime columns
  - `runtime_state`
  - `active_stream_token`
  - `active_stream_closed`
  - `active_stream_started_at`
  - `active_stream_closed_at`
- Redis
  - runtime snapshot cache
  - wake channel pub/sub
  - 세션 종료/스트림 종료 wake signal

즉, 더 이상 순수 메모리 Map 기반 세션 구조가 아니다.

## 8. 현재 SSE 계약

현재 SSE는 named event가 아니라 `data:` JSON payload만 사용한다.

예시:

```text
data: {"eventType":"SESSION_CREATED","sessionId":"..."}

data: {"eventType":"THINK"}

data: {"eventType":"TOKEN","content":"분석 중입니다."}

data: {"eventType":"DONE"}
```

`TOKEN.content` 안에는 일반 텍스트 또는 JSON 직렬화 문자열이 들어올 수 있으며, 프론트는 이를 파싱해서 생각 중 상태와 실제 답변을 구분한다.

## 9. 관리자 추적 화면

관리자 추적 페이지는 `/admin/traces`에서 최근 trace를 본다.

백엔드:

- [rag-trace.admin.controller.ts](../apps/api/src/modules/rag/rag-trace.admin.controller.ts)

프론트:

- [admin/traces/page.tsx](../apps/web/app/admin/traces/page.tsx)
- [admin-trace-graph.tsx](../apps/web/components/admin-trace-graph.tsx)

표시 정보:

- routeType
- tool selection
- vector hits
- graph walk path
- 최종 answer
- 질문별 event timeline

## 10. 현재 평가

현재 구조 평가는 다음과 같다.

- 장점
  - 책임 분리가 명확해졌다.
  - 검색형/자격확인형/신청도움형 그래프 경계가 명확하다.
  - retrieval와 trace가 구조화되어 디버깅 가능성이 높다.
  - 세션 런타임이 DB + Redis 기반으로 개선됐다.

- 남은 주의점
  - `QueryAnalysisService`는 regex/heuristic 품질 관리가 계속 필요하다.
  - `RagTraceService`는 여전히 비교적 크고 write-heavy 하다.
  - 품질을 보장하려면 평가셋과 통합 테스트가 더 필요하다.

현재 상태를 한 줄로 요약하면:

> 아키텍처는 이제 충분히 안정적이고 확장 가능하다.  
> 다음 우선순위는 구조 리팩토링보다 라우팅 품질과 회귀 테스트 체계다.

