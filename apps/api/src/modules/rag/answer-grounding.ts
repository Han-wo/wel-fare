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
    grounded: haystack.includes(name),
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
