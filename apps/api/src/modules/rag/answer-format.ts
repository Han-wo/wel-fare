/**
 * 답변 형식 준수 검사의 순수 로직 (관찰 전용).
 *
 * 시스템 프롬프트(prompts.ts)가 강제하는 답변 계약을 답변이 실제로 지켰는지
 * LLM 없이 결정적으로 검사한다. 위반해도 답변을 막거나 바꾸지 않고
 * trace에 '답변 형식 경고' 이벤트만 남긴다 — 프롬프트를 수정했을 때
 * 형식 준수율이 좋아졌는지 rag_traces 집계로 추적하기 위한 운영 지표다.
 *
 * 마커를 바꾸면 prompts.ts와 prompt-contract.spec.ts를 함께 바꿔야 한다.
 */

export interface AnswerFormatResult {
  compliant: boolean;
  violations: string[];
}

const ok: AnswerFormatResult = { compliant: true, violations: [] };

const POLICY_BLOCK_RE = /📋\s*\[/;
const SUMMARY_LINE_RE = /💡\s*\*\*핵심 요약\*\*/;
const ELIGIBILITY_VERDICT_RE = /^\[(가능|불확실|어려움)\]/;
const APPLICATION_SECTION_RES: Array<[string, RegExp]> = [
  ['신청 순서 없음', /신청\s*순서|신청\s*방법/],
  ['바로 할 일 없음', /바로\s*할\s*일/],
];

// SEARCH: 정책 블록(📋)을 쓴 답변이라면 핵심 요약 한 줄이 있어야 한다.
// 정책 블록이 없는 답변(못 찾음 안내 등)은 형식 검사 대상이 아니다.
export function checkSearchAnswerFormat(answer: string): AnswerFormatResult {
  const text = answer.trim();
  if (!text || !POLICY_BLOCK_RE.test(text)) return ok;

  const violations: string[] = [];
  if (!SUMMARY_LINE_RE.test(text)) violations.push('핵심 요약 줄 없음');

  return { compliant: violations.length === 0, violations };
}

// ELIGIBILITY: 첫 비어있지 않은 줄이 판정 태그로 시작해야 한다.
export function checkEligibilityAnswerFormat(answer: string): AnswerFormatResult {
  const firstLine = answer
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return ok;

  if (!ELIGIBILITY_VERDICT_RE.test(firstLine)) {
    return { compliant: false, violations: ['첫 줄이 판정 태그([가능]/[불확실]/[어려움])로 시작하지 않음'] };
  }
  return ok;
}

// APPLICATION_ASSIST: 실행 가이드라면 신청 순서와 "바로 할 일" 마무리가 있어야 한다.
export function checkApplicationAnswerFormat(answer: string): AnswerFormatResult {
  const text = answer.trim();
  if (!text) return ok;

  const violations = APPLICATION_SECTION_RES.filter(([, re]) => !re.test(text)).map(
    ([label]) => label,
  );
  return { compliant: violations.length === 0, violations };
}
