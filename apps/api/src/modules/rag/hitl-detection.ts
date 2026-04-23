const REASKING_PHRASE =
  /(번호(를)?\s*(골라|선택|알려|말씀)|어느\s*(것|항목|분야)|아래\s*중(에서)?|원하시는\s*(번호|항목|분야|것)|선택\s*해\s*주세요|골라주시면|몇\s*번|다음\s*중\s*어느)/;
const BULLET_MARKERS = /(^|\n)\s*(?:[-*·•]|\d+\.)\s+/g;
const UNCERTAIN_PHRASE =
  /\[불확실\]|판단\s*(할?\s*수\s*없|불가)|정보가?\s*(부족|충분하지|없어)|근거(가|를)?\s*(부족|없)|정책\s*문서가\s*(제공되지|없)/;

export type HitlDetectionReason =
  | 'empty_answer'
  | 'uncertain_phrasing'
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

  const bulletCount = (answer.match(BULLET_MARKERS) ?? []).length;
  if (REASKING_PHRASE.test(answer) && bulletCount >= 2) {
    return { needsHitl: true, reason: 'reasking_with_options' };
  }

  return { needsHitl: false, reason: null };
}
