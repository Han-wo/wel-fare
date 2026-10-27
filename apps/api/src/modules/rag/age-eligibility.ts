/**
 * 연령 조건의 결정적 3치 판정.
 *
 * 배경: 자격 판정은 지금까지 전부 LLM이 자연어 지원대상 텍스트를 읽고 했다.
 * 그런데 청년정책 2,785건은 시더가 이미 구조화 조건을 넣어두고 있었다
 * (reqType:'AGE', operator:'BETWEEN', minValue, maxValue) — 그리고 RAG는
 * 그걸 한 번도 읽지 않았다. 확정적으로 답할 수 있는 축 하나를 LLM 추측에
 * 맡기고 있던 셈이다.
 *
 * 3치인 이유: "나이를 모름"과 "나이가 안 맞음"은 다르다. 전자를 탈락으로
 * 처리하면 프로필에 생년월일이 없는 사용자에게 모든 정책이 사라진다.
 * UNKNOWN은 판단을 보류하고 기존 동작(LLM 판단)에 맡긴다.
 */
export type AgeVerdict = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

export interface AgeRequirement {
  minValue?: number | null;
  maxValue?: number | null;
  /** 원문 표기("만 19세 ~ 만 39세"). 사유 문장에 그대로 인용한다. */
  description?: string | null;
}

export interface AgeAssessment {
  verdict: AgeVerdict;
  /** MISMATCH일 때만 채워지는 사람이 읽는 사유. */
  reason: string | null;
}

/**
 * 온통청년 원천의 연령 경계를 도메인 값으로 정규화한다.
 *
 * 원천은 "제한 없음"을 0으로 표현한다. 실제로 연령 무관 정책(K-패스 등)이
 * `sprtTrgtMinAge="0"`, `sprtTrgtMaxAge="0"`으로 들어오며, 코퍼스 2,785건 중
 * 685건이 0~0이다. 이걸 그대로 범위로 쓰면 "만 0세 이하만 해당"이 되어
 * 685건 전부가 잘못 미해당 처리된다.
 *
 * (99·100·999 같은 상한도 사실상 무제한이지만, 사람 나이로는 어차피
 *  충족되므로 굳이 특수 처리하지 않는다.)
 */
export function normalizeAgeBound(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatRange(
  minValue: number | null,
  maxValue: number | null,
  description: string | null | undefined,
): string {
  // 원문 표기를 우선 쓰되, 센티널이 섞인 것("만 15세 ~ 만 0세")은 버린다.
  // 그대로 인용하면 사용자에게 "만 0세 대상"이라는 거짓 사유가 나간다.
  const raw = description?.trim();
  if (raw && !raw.includes('만 0세')) return raw;
  if (minValue != null && maxValue != null) return `만 ${minValue}세 ~ 만 ${maxValue}세`;
  if (minValue != null) return `만 ${minValue}세 이상`;
  if (maxValue != null) return `만 ${maxValue}세 이하`;
  return '연령 조건';
}

export function assessAge(
  age: number | null | undefined,
  requirement: AgeRequirement | null | undefined,
): AgeAssessment {
  if (!requirement) return { verdict: 'UNKNOWN', reason: null };

  // 0(= 제한 없음 센티널)을 여기서 걸러낸다. 호출부가 정규화를 잊어도
  // 연령 무관 정책이 미해당으로 뒤집히지 않도록 판정 안에서 한 번 더 막는다.
  const minValue = normalizeAgeBound(requirement.minValue);
  const maxValue = normalizeAgeBound(requirement.maxValue);
  // 범위가 양쪽 다 비면 조건이 없는 것과 같다.
  if (minValue == null && maxValue == null) return { verdict: 'UNKNOWN', reason: null };

  // 나이를 모르면 보류. 탈락이 아니다.
  if (age == null || !Number.isFinite(age)) return { verdict: 'UNKNOWN', reason: null };

  const belowMin = minValue != null && age < minValue;
  const aboveMax = maxValue != null && age > maxValue;

  if (belowMin || aboveMax) {
    return {
      verdict: 'MISMATCH',
      reason: `${formatRange(minValue, maxValue, requirement.description)} 대상이라 만 ${age}세인 경우 해당하지 않습니다`,
    };
  }

  return { verdict: 'MATCH', reason: null };
}

/**
 * 판정 결과를 문서 본문에 덧붙일 한 줄로 만든다.
 *
 * 본문의 다른 필드와 같은 `[키] 값` 형식을 쓰는 이유는 두 가지다.
 *  - LLM이 나머지 근거와 같은 방식으로 읽는다.
 *  - answer-grounding이 답변의 사유 문장을 근거 본문에서 찾을 수 있다
 *    (사유를 지어낸 것으로 오탐하지 않는다).
 */
export function formatAgeVerdictLine(assessment: AgeAssessment): string | null {
  if (assessment.verdict === 'MISMATCH') {
    return `[연령 판정] 미해당 — ${assessment.reason}`;
  }
  if (assessment.verdict === 'MATCH') {
    return '[연령 판정] 해당 — 연령 조건을 충족합니다';
  }
  return null;
}
