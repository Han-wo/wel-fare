/**
 * 답변 그라운딩(faithfulness) 검증의 순수 로직.
 *
 * 생성된 답변이 실제 검색 근거(retrieved docs)에 붙어 있는지 LLM 없이 결정적으로
 * 검사한다. 복지 도메인에서 가장 위험한 환각 세 가지를 노린다.
 *
 *  1. 신청링크(URL)  — 가짜 신청 페이지로 유도하면 직접적 피해.
 *  2. 정책명         — 존재하지 않는 정책을 안내.
 *  3. 금액           — 잘못된 지원 금액.
 *
 * 각 주장(claim)이 근거 문서에 등장하지 않으면 ungrounded(환각 후보)로 본다.
 * 링크/정책명은 고정밀(substring)으로 hard 판정에 쓰고, 금액은 포맷 편차가 커서
 * 숫자열 비교로 soft 신호로만 보고한다.
 */
export interface GroundingDoc {
  title?: string | null;
  content?: string | null;
}

export interface GroundingFinding {
  claim: string;
  grounded: boolean;
}

export interface AnswerGroundingResult {
  grounded: boolean; // ungrounded 링크/정책명이 하나도 없을 때 true
  links: GroundingFinding[];
  policyNames: GroundingFinding[];
  amounts: GroundingFinding[];
  ungrounded: { links: string[]; policyNames: string[]; amounts: string[] };
}

const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
// 답변 형식 "### 📋 [정책명]" / "📋 [정책명]" 의 대괄호 정책명.
const POLICY_NAME_RE = /📋\s*\[([^\]]+)\]/g;
const AMOUNT_RE = /(\d[\d,]*)\s*(만\s*원|원)/g;

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function extractUrls(answer: string): string[] {
  return uniq(answer.match(URL_RE) ?? []);
}

function extractPolicyNames(answer: string): string[] {
  const names: string[] = [];
  for (const match of answer.matchAll(POLICY_NAME_RE)) {
    if (match[1]) names.push(match[1]);
  }
  return uniq(names);
}

function extractAmounts(answer: string): string[] {
  const amounts: string[] = [];
  for (const match of answer.matchAll(AMOUNT_RE)) {
    amounts.push(match[0]);
  }
  return uniq(amounts);
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

// 괄호 주석(전각 포함)을 떼고 공백을 정규화한다.
const PAREN_RE = /[(（][^)）]*[)）]/g;

function stripParentheticals(value: string): string {
  return value.replace(PAREN_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 답변의 정책명이 근거에 있는지 판정한다.
 *
 * 원문 그대로 매치되지 않으면 괄호 주석을 떼고 한 번 더 본다. 지자체 복지는
 * 동명 정책이 지역마다 있어서 LLM이 "장애인활동지원 추가지원사업(충청북도)"처럼
 * 지역을 덧붙이는데, 이건 근거를 벗어난 주장이 아니라 유용한 구별 표기다.
 * 순수 substring 비교는 이걸 환각으로 오탐해 6초짜리 정정 LLM을 태우고
 * 멀쩡한 답변에 정정 부록을 붙였다 (실측 오탐 5/6건).
 *
 * 괄호 밖 텍스트까지 합성한 이름("공공임대주택(예: …) - 경기도 사례")은
 * 괄호를 떼도 근거에 없으므로 여전히 ungrounded로 남는다 — 진짜 환각은 계속 잡는다.
 */
function isPolicyNameGrounded(name: string, haystack: string): boolean {
  if (haystack.includes(name)) return true;

  const stripped = stripParentheticals(name);
  if (!stripped || stripped === name) return false;
  return stripParentheticals(haystack).includes(stripped);
}

export function checkAnswerGrounding(
  answer: string | null | undefined,
  docs: GroundingDoc[],
): AnswerGroundingResult {
  const haystack = docs
    .map((doc) => `${doc.title ?? ''}\n${doc.content ?? ''}`)
    .join('\n');
  const haystackDigits = digitsOnly(haystack);
  const text = answer ?? '';

  const links: GroundingFinding[] = extractUrls(text).map((url) => ({
    claim: url,
    grounded: haystack.includes(url),
  }));

  const policyNames: GroundingFinding[] = extractPolicyNames(text).map((name) => ({
    claim: name,
    grounded: isPolicyNameGrounded(name, haystack),
  }));

  const amounts: GroundingFinding[] = extractAmounts(text).map((amount) => {
    const d = digitsOnly(amount);
    return { claim: amount, grounded: d.length > 0 && haystackDigits.includes(d) };
  });

  const ungrounded = {
    links: links.filter((f) => !f.grounded).map((f) => f.claim),
    policyNames: policyNames.filter((f) => !f.grounded).map((f) => f.claim),
    amounts: amounts.filter((f) => !f.grounded).map((f) => f.claim),
  };

  // hard 판정은 고위험·고정밀 신호(링크/정책명)만으로. 금액은 보고만 한다.
  const grounded = ungrounded.links.length === 0 && ungrounded.policyNames.length === 0;

  return { grounded, links, policyNames, amounts, ungrounded };
}
