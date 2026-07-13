/**
 * 후속 질문(follow-up) 휴리스틱 — 순수 함수.
 *
 * 모든 턴에 LLM 재작성을 돌리면 TTFB가 늘어나므로, 지시어가 있거나 혼자서는
 * 뜻이 안 통할 만큼 짧은 질문만 재작성 후보로 고른다. 오탐(독립형인데 후보로
 * 뽑힘)은 재작성기가 changed=false로 거르므로 비용만 조금 들고 무해하다.
 */

const ANAPHORA_PHRASE =
  /(그거|그건|그걸|그게|그것|그런\s*거|그럼|그중|그\s*중|이건|이거|이걸|저건|위에\s*(말한|나온|있는)|아까|방금|앞(에서)?\s*(말한|나온)|(첫|두|세|네)\s*번째|마지막\s*(거|것|정책|공고)|그\s*(정책|공고|사업|지원금|제도)|이\s*(정책|공고|사업|지원금|제도)|거기(서|에)?|얘는|나머지)/;

/** 이 길이 이하의 질문은 지시어가 없어도 맥락 의존일 가능성이 높다 (예: "조건은?", "링크 줘") */
const SHORT_QUESTION_LENGTH = 12;

export function isLikelyFollowUp(question: string, hasHistory: boolean): boolean {
  if (!hasHistory) return false;
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (ANAPHORA_PHRASE.test(trimmed)) return true;
  return trimmed.length <= SHORT_QUESTION_LENGTH;
}
