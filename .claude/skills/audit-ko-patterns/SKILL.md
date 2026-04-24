---
name: audit-ko-patterns
description: RAG 라우팅(QueryAnalysisService)과 HITL 탐지(hitl-detection)에 쓰이는 한국어 정규식 규칙을 샘플 질문에 돌려 매칭 결과를 표로 내고, false positive/negative, 규칙 간 충돌, 커버리지 갭을 리포트합니다. 사용자가 "라우팅 규칙 점검", "정규식 감사", "HITL 탐지 검증", "이 질문이 왜 이 그래프로 갔는지", "패턴 커버리지"를 요청할 때 트리거.
---

# /audit-ko-patterns

이 프로젝트의 intent 판별과 HITL 탐지는 **한국어 정규식에 강하게 의존**합니다. 정책이 추가되거나 사용자 표현이 다양해지면 이 규칙들이 조용히 어긋나기 시작합니다. 이 스킬은 그 regex 레이어를 감사합니다.

## 감사 대상 파일

**가장 중요한 것 두 개:**
- `apps/api/src/modules/rag/query-analysis.service.ts` — 라우팅 + pre-route + clarification
- `apps/api/src/modules/rag/hitl-detection.ts` — HITL 재질문 트리거

**레퍼런스 테스트:**
- `apps/api/src/modules/rag/query-analysis.service.spec.ts` — 기대 동작 예시

## 규칙 맵 (2026-04 시점 — 변경됐을 수 있으니 파일을 먼저 읽고 시작할 것)

### 최상위 라우팅 (`resolveRoute`)
- `ELIGIBILITY_INTENT` — 자격/조건/대상/eligible 의도
- `APPLICATION_ASSIST_INTENT` — 신청 방법/절차/서류
- 그 외 → `SEARCH`

### SEARCH pre-route (`resolveSearchPreRoute`) — 정규식 히트 시 LLM 우회
- `CLEAR_DEADLINE` → `get_upcoming_deadlines`
- `CLEAR_HOUSING_TIMELINE` + 청약/공고 키워드 → `get_upcoming_deadlines` (동적 `days_ahead`)
- `CLEAR_YOUTH` & !`CLEAR_HOUSING_SUB` → `search_youth_policy`
- `CLEAR_HOUSING_SUB` & !`CLEAR_YOUTH` → `search_housing_subscription`
- `CLEAR_RENTAL` → `search_rental_support`
- `CLEAR_FACILITY` → `search_welfare_facility`

### Clarification 필수 필드 (`getClarificationRequest`)
- `PRONOUN_POLICY`("이 정책", "그 공고")가 매치되고 `SPECIFIC_PROGRAM`이 없으면 → `policy_name` 요청
- SEARCH + `PERSONALIZED`일 때, 그리고 ELIGIBILITY/APPLICATION_ASSIST 경로에서 각 trigger 조건에 따라 `age/region/income/housing` 필드 요청
- `EXPLICIT_REGION/EXPLICIT_AGE/EXPLICIT_INCOME/EXPLICIT_HOUSING`이 매치되면 프로필 없어도 만족으로 처리

### HITL 탐지 (`hitl-detection.ts`)
- `empty_answer` — 답변이 비었거나 공백만
- `uncertain_phrasing` — `UNCERTAIN_PHRASE` 매치 (예: "[불확실]", "판단 불가", "정보가 부족")
- `reasking_with_options` — `REASKING_PHRASE` 매치 + 불릿 ≥ 2개

## 감사 절차

1. **파일 먼저 읽기**. 정규식이 바뀌어 있을 수 있음. 절대로 이 스킬의 복사본에 의존하지 말고 `query-analysis.service.ts`와 `hitl-detection.ts`를 매번 새로 확인.

2. **규칙 인벤토리 뽑기**. 각 정규식을 이름과 함께 추출:
   ```bash
   grep -nE 'const (CLEAR_|EXPLICIT_|REASKING_|UNCERTAIN_|BULLET_|[A-Z_]+_INTENT|YOUTH|HOUSING|FACILITY|DEADLINE|PERSONALIZED|LOW_INCOME|PRONOUN_POLICY|SPECIFIC_PROGRAM)' \
     apps/api/src/modules/rag/query-analysis.service.ts \
     apps/api/src/modules/rag/hitl-detection.ts
   ```

3. **샘플 세트를 만들거나 받음**. 세 가지 소스:
   - **실제 트래픽**: `rag_traces` 테이블의 `question` 컬럼에서 최근 N건 샘플링.
     ```sql
     SELECT question, route_type FROM rag_traces
     WHERE started_at > now() - interval '7 days'
     ORDER BY random() LIMIT 100;
     ```
   - **사용자가 준 목록**: 인자로 들어오면 그걸 씀
   - **합성 세트**: 스킬이 생성. 각 intent별 변형 + 엣지케이스 (조사 생략/철자 변형/혼합 의도)

4. **매칭 매트릭스 출력**. 각 질문 × 규칙 이름 표. 두 가지 관점으로:
   - **질문 관점**: 이 질문이 어느 규칙에 매치되어 어디로 라우팅됐는지
   - **규칙 관점**: 이 규칙이 총 몇 건 매치했는지, 충돌은 몇 건인지

5. **이상 패턴 검출** — 다음을 각각 건수와 예시로 리포트:
   - **충돌**: 상호배타여야 하는데 동시 매치. 예) `CLEAR_YOUTH`와 `CLEAR_HOUSING_SUB` 동시 매치 → pre-route에서 둘 다 탈락.
   - **Dead rule**: 100건 중 0건 매치 → 리팩토링 중 의미 상실했을 가능성.
   - **Over-match**: 매치 건수가 전체의 >40% → 너무 넓음 (예: `HOUSING`이 "집"이라는 단어만 있어도 매치 같은 경우).
   - **HITL false positive 후보**: `UNCERTAIN_PHRASE`가 매치되었는데 사람이 보기에 확정적 답변인 것.
   - **Clarification 누락 후보**: `PERSONALIZED`인데 프로필도 explicit 필드도 없이 통과된 SEARCH 질문.
   - **DB 실측과 엇갈림**: `rag_traces.route_type`이 `resolveRoute`의 재실행 결과와 다른 건 (그 사이 규칙이 바뀜).

6. **Actionable 제안 붙이기** — 그냥 통계만 내지 말 것. 각 이상에 대해:
   - 규칙 수정 후보 (예: "`CLEAR_HOUSING_SUB`에 `국민임대\\s*모집공고` 추가")
   - 새 테스트 케이스 (spec 파일에 추가할 수 있는 형태)
   - 확신 없으면 명시 ("사람 확인 필요")

## 실행 보조

정규식을 직접 Node에서 돌려보려면:

```bash
node -e "
const q = '내가 행복주택 받을 수 있어?';
const ELIGIBILITY_INTENT = /받을 수 있|받을수있|자격(이|은|을)?|조건(이|은|을)?\s*(뭐|무엇|어떻|되는|맞|해당)|대상인지|해당되|가능한지|eligible/i;
console.log(ELIGIBILITY_INTENT.test(q));
"
```

또는 spec을 직접 돌리기:
```bash
pnpm --filter @welfare-ai/api test query-analysis
```

## 출력 포맷

```
## 감사 범위
- 파일: query-analysis.service.ts (@ <git sha>), hitl-detection.ts (@ <git sha>)
- 샘플: 100건 (최근 7일 rag_traces 랜덤)

## 라우팅 분포
SEARCH            62 (62%)
ELIGIBILITY       23 (23%)
APPLICATION_ASSIST 15 (15%)

## Pre-route 커버리지
get_upcoming_deadlines     18
search_youth_policy         9
search_housing_subscription 12
search_rental_support       4
search_welfare_facility     2
(LLM fallback)             55

## ⚠ 이상치
1. [충돌] 5건이 CLEAR_YOUTH와 CLEAR_HOUSING_SUB 동시 매치 → 둘 다 배제되어 LLM fallback으로 빠짐
   예: "청년 행복주택 청약 일정"
   제안: 우선순위 규칙 명시 (청약 키워드가 동반되면 housing 우선)

2. [Dead rule] CLEAR_FACILITY: 0건 매치
   제안: 프로덕션에서 이 경로가 정말 필요한지 확인

3. [HITL FP 후보] "uncertain_phrasing" 3건, 실제로는 확정 답변에 "정보가 부족할 수 있어"가 포함된 경우
   제안: UNCERTAIN_PHRASE를 앞머리 위치 제약으로 좁히기

## Actionable TODO
- [ ] spec에 케이스 추가: "청년 행복주택 청약"
- [ ] CLEAR_FACILITY 실트래픽 히트 여부 확인 후 제거/수정 결정
```

## 주의

- regex는 한국어 조사/어미 변형 때문에 한 글자만 빠져도 매치가 사라짐. `\\s*`, `(이|은|을)?` 패턴을 유지하며 제안할 것.
- 샘플에 민감 정보(이름, 전화번호)가 있으면 마스킹 후 출력.
- 사용자가 "지금 내 질문 하나만 분석해줘"라고 하면 매트릭스는 생략하고 해당 질문 하나에 대한 규칙별 매칭 여부만 출력.
