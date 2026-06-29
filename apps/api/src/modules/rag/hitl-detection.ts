const REASKING_PHRASE =
  /(번호(를)?\s*(골라|선택|알려|말씀)|어느\s*(것|항목|분야)|아래\s*중(에서)?|원하시는\s*(번호|항목|분야|것)|선택\s*해\s*주세요|골라주시면|몇\s*번|다음\s*중\s*어느)/;
const BULLET_MARKERS = /(^|\n)\s*(?:[-*·•]|\d+\.)\s+/g;
const UNCERTAIN_PHRASE =
  /\[불확실\]|판단\s*(할?\s*수\s*없|불가)|정보가?\s*(부족|충분하지|없어)|근거(가|를)?\s*(부족|없)|정책\s*문서가\s*(제공되지|없)/;
// 검색이 물어본 걸 못 찾았다는 신호(엔티티 부재 게이트가 놓친 경우의 reactive 안전망).
// "검색 실패 동사"만 매치한다. "지금 신청 가능한 X는 없습니다" 같은 가용성 문구는
// 정상 답변이므로 의도적으로 제외(이건 검색 실패가 아니라 '찾았으나 접수 종료').
const NOT_FOUND_PHRASE = /찾을\s*수\s*없|찾지\s*못했|조회되지\s*않|검색되지\s*않/;

export type HitlDetectionReason =
  | 'empty_answer'
  | 'uncertain_phrasing'
  | 'no_results'
  | 'reasking_with_options';

export function detectAnswerNeedsHitl(answer: string | null | undefined): {
  needsHitl: boolean;
  reason: HitlDetectionReason | null;
} {
  if (!answer || !answer.trim()) {
    return { needsHitl: true, reason: 'empty_answer' };
  }

  if (UNCERTAIN_PHRASE.test(answer)) {
    return { needsHitl: true, reason: 'uncertain_phrasing' };
  }

  if (NOT_FOUND_PHRASE.test(answer)) {
    return { needsHitl: true, reason: 'no_results' };
  }

  const bulletCount = (answer.match(BULLET_MARKERS) ?? []).length;
  if (REASKING_PHRASE.test(answer) && bulletCount >= 2) {
    return { needsHitl: true, reason: 'reasking_with_options' };
  }

  return { needsHitl: false, reason: null };
}
