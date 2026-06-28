# 정규식 라우팅에 안전망 씌우기: WelfareAI의 라우팅 Eval 하네스

이 글은 WelfareAI의 질문 라우팅 계층에 **회귀 안전망(eval harness)** 을 붙인 과정을 정리한 글이다.

핵심 주장은 하나다. **LLM 시스템에서 "정규식 한 줄"은 프롬프트만큼이나 자주 흔들리는 추론 코드인데, 보통 테스트가 없다.** 그래서 라우팅 규칙을 데이터셋으로 잠그고, 어긋남을 자동으로 분류하는 하네스를 만들었다.

## 배경: 라우팅은 LLM 이전에 일어난다

WelfareAI는 질문을 세 갈래로 나눠 전용 LangGraph를 태운다.

- `SEARCH` — "지금 신청 가능한 청약 뭐 있어?" 같은 검색형
- `ELIGIBILITY` — "나 청년월세 받을 수 있어?" 같은 자격 판정형
- `APPLICATION_ASSIST` — "청년월세 신청 방법 알려줘" 같은 절차 안내형

그리고 `SEARCH` 안에서는 LLM에게 도구 선택을 맡기기 전에, 정규식으로 **사전 라우팅(pre-route)** 을 한 번 더 한다. "오늘 청약"이면 곧장 `get_upcoming_deadlines`로, "청년수당"이면 `search_youth_policy`로 보내는 식이다. 불필요한 tool-call 추론을 줄여 지연과 비용을 아끼는 장치다.

이 모든 판단의 1차 관문이 `QueryAnalysisService`의 정규식 묶음이다.

```ts
const CLEAR_YOUTH =
  /청년수당|청년적금|청년도약계좌|온통청년|청년내일채움|.../;
const CLEAR_HOUSING_SUB =
  /청약홈\s*공고|분양\s*공고|행복주택\s*청약|청약\s*일정|.../;
// ...
if (CLEAR_YOUTH.test(q) && !CLEAR_HOUSING_SUB.test(q)) return youthPolicy;
if (CLEAR_HOUSING_SUB.test(q) && !CLEAR_YOUTH.test(q)) return housingSub;
```

## 문제: 이 추론 코드에 테스트가 거의 없었다

라우팅은 답변 품질의 상한선을 결정한다. **라우팅이 틀리면 그 뒤 LLM이 아무리 잘해도 틀린 그래프 위에서 잘하는 것**이기 때문이다.

그런데 이 계층의 테스트는 단위 테스트 2개뿐이었다. 정규식은 다음과 같은 이유로 조용히 깨진다.

- 새 키워드를 추가하다가 기존 매칭을 가린다.
- 두 규칙이 같은 질문을 두고 충돌한다(상호배제 조건의 부작용).
- "이 질문이 왜 저 그래프로 갔지?"를 사람이 매번 손으로 추적한다.

프롬프트에는 보통 평가셋을 붙이면서, 정작 프롬프트 앞단의 정규식에는 안 붙이는 경우가 많다. 라우팅도 똑같이 **데이터셋으로 평가받아야 하는 추론 코드**다.

## 설계: 단위 테스트가 아니라 "하네스"

목표를 세 가지로 잡았다.

1. **회귀 차단** — 의도한 동작이 깨지면 CI가 빨개진다.
2. **갭 가시화** — 아직 못 고친 한계는 빌드를 깨지 않으면서도 리포트에 드러난다.
3. **사람이 읽는 리포트** — "어떤 질문이 어디로 갔고, 기대와 어떻게 다른가"를 한눈에.

이를 위해 케이스를 세 분류로 판정한다.

| 판정 | 의미 | CI |
|---|---|---|
| `PASS` | 기대값과 일치 | 통과 |
| `KNOWN_GAP` | 어긋나지만 `knownGap`으로 문서화된 한계 | 통과(리포트 표시) |
| `REGRESSION` | 문서화되지 않은 어긋남 | **실패** |

`KNOWN_GAP`이 핵심이다. 평가셋을 도입할 때 흔한 함정은 "지금 못 고치는 케이스를 넣으면 CI가 영원히 빨갛다"라서 아예 안 넣는 것이다. 그러면 평가셋이 현실을 반영하지 못한다. 그래서 **인지된 한계는 명시적으로 표시**해 두고, 그 외의 새로운 어긋남만 회귀로 잡는다.

## 구현

골든 데이터셋은 질문과 기대값을 그대로 들고 있다.

```ts
export interface RoutingGoldenCase {
  id: string;
  question: string;
  expectedRoute: RagRouteType;
  expectedPreRouteTool?: PreRouteToolName | null; // SEARCH일 때만 검증
  tags?: string[];
  knownGap?: { reason: string };
}
```

하네스는 `QueryAnalysisService`를 그대로 돌려 분류만 한다. 순수 함수라 jest와 CLI가 같은 로직을 공유한다.

```ts
let verdict: RoutingVerdict;
if (mismatches.length === 0)      verdict = 'PASS';
else if (testCase.knownGap)       verdict = 'KNOWN_GAP';
else                              verdict = 'REGRESSION';
```

소비처는 둘이다.

- `routing-eval.spec.ts` — CI 안전망. 회귀가 있으면 전체 리포트를 에러 메시지로 던진다. 케이스마다 개별 테스트로도 노출해 러너에서 바로 보인다.
- `run-routing-eval.ts` (`pnpm --filter @welfare-ai/api eval:routing`) — 사람이 읽는 리포트. 회귀가 있으면 exit 1.

## 결과: 첫 실행에서 진짜 갭이 잡혔다

26개 케이스로 돌린 결과는 이렇다.

```
=== Routing Eval Harness ===
total 26 | pass 25 | known-gap 1 | regression 0

✓ [PASS] deadline-now — "지금 신청 가능한 청약 공고 보여줘"
✓ [PASS] youth-allowance — "청년수당 어떤 게 있어?"
...
~ [KNOWN_GAP] conflict-youth-and-housing — "청년수당이랑 청약 일정 같이 알려줘"
    ↳ preRoute: expected search_youth_policy, got null
    ↳ gap: CLEAR_YOUTH && !CLEAR_HOUSING_SUB / CLEAR_HOUSING_SUB && !CLEAR_YOUTH
       의 상호배제로 두 키워드 동시 등장 시 사전 라우팅이 null로 빠진다.
```

마지막 케이스가 하네스의 존재 이유를 그대로 보여준다.

`"청년수당이랑 청약 일정 같이 알려줘"`는 청년 키워드와 청약 키워드를 **둘 다** 갖는다. 그런데 사전 라우팅 규칙은 `CLEAR_YOUTH && !CLEAR_HOUSING_SUB`, `CLEAR_HOUSING_SUB && !CLEAR_YOUTH`처럼 **상호배제**로 짜여 있다. 두 키워드가 동시에 등장하면 두 분기 모두 건너뛰고, 사전 라우팅이 통째로 `null`로 빠진다. 멀티 인텐트 질문에서 최적화 장치가 조용히 사라지는 것이다.

이건 누가 의도해서 만든 버그가 아니라, 규칙을 하나씩 추가하다 생긴 **창발적 충돌**이다. 사람이 코드만 읽어서는 잘 안 보이고, 데이터를 흘려보내야 드러난다. 하네스는 이걸 빌드를 깨지 않으면서 `KNOWN_GAP`으로 박제해 뒀다. 나중에 우선순위 규칙으로 고치고 `knownGap`만 떼면 그 순간부터 회귀 대상이 된다.

## 덤: 깨져 있던 기존 테스트가 같이 살아났다

작업 중에 기존 `query-analysis.service.spec.ts`가 워크스페이스 패키지 타입(`@welfare-ai/shared-types`)을 못 찾아 **이미 깨져 있었다**는 걸 발견했다. ts-jest가 빈 `tsconfig.paths`로 타입을 해소하지 못한 탓이다.

프로덕션 빌드 설정을 건드리지 않으려고 테스트 전용 `tsconfig.spec.json`을 만들어 경로만 잡아 줬다.

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@welfare-ai/shared-types": ["../../packages/shared-types/src"],
      "@welfare-ai/shared-utils": ["../../packages/shared-utils/src"]
    }
  }
}
```

결과적으로 새 하네스(28개)와 복구된 기존 스펙을 포함해 **전체 40개 테스트가 통과**한다.

## 회고: 하네스 엔지니어링이라는 관점

이번 작업은 모델을 바꾸지도, 프롬프트를 튜닝하지도 않았다. 대신 LLM **주변의 결정 로직**에 평가 가능한 표면을 붙였다. 정리하면 LLM 시스템에는 이런 안전망이 더 필요하다.

- **라우팅 평가셋** — 이번 글의 대상. 프롬프트 앞단의 정규식도 평가받아야 한다.
- **답변 그라운딩 검증** — 생성된 답변이 실제 검색 근거에 붙어 있는지(특히 자격·금액 같은 환각 위험 영역).
- **검색 신뢰도 게이트** — 점수 낮은 근거로 답을 만들지 않게.
- **LLM 호출 회복력** — 재시도·타임아웃·폴백.

다음 단계는 이 골든셋을 `audit-ko-patterns` 스킬 출력과 연결해 케이스를 자동으로 흡수시키고, 자격 그래프에 답변 그라운딩 검증을 붙이는 것이다.

핵심 교훈은 단순하다. **LLM 시스템에서 가장 자주 조용히 깨지는 건 모델이 아니라, 모델을 둘러싼 결정 로직이다. 그 로직에 데이터셋을 흘려보내는 순간, 보이지 않던 갭이 보인다.**
