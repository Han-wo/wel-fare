const REASKING_PHRASE =
  /(번호(를)?\s*(골라|선택|알려|말씀)|어느\s*(것|항목|분야)|아래\s*중(에서)?|원하시는\s*(번호|항목|분야|것)|선택\s*해\s*주세요|골라주시면|몇\s*번|다음\s*중\s*어느)/;
const BULLET_MARKERS = /(^|\n)\s*(?:[-*·•]|\d+\.)\s+/g;
const UNCERTAIN_PHRASE =
  /\[불확실\]|판단\s*(할?\s*수\s*없|불가)|정보가?\s*(부족|충분하지|없어)|근거(가|를)?\s*(부족|없)|정책\s*문서가\s*(제공되지|없)/;
// 검색이 물어본 걸 못 찾았다는 신호(엔티티 부재 게이트가 놓친 경우의 reactive 안전망).
// "검색 실패 동사"만 매치한다. "지금 신청 가능한 X는 없습니다" 같은 가용성 문구는
// 정상 답변이므로 의도적으로 제외(이건 검색 실패가 아니라 '찾았으나 접수 종료').
const NOT_FOUND_PHRASE = /찾을\s*수\s*없|찾지\s*못했|조회되지\s*않|검색되지\s*않/;
const LINK_PHRASE = /https?:\/\//;

// 이 길이를 넘는 답변은 표지 문구가 섞여 있어도 실질 답변으로 본다.
// 자격확인 프롬프트가 [불확실] 라벨을 의도적으로 출력하고, 긴 근거 목록형 답변이
// "찾을 수 없" 류 표현을 부분적으로 포함하는 경우가 흔하기 때문. HITL 가로채기는
// 답변 전체가 실패·재질문일 때만 발동해야 한다.
const SUBSTANTIAL_ANSWER_LENGTH = 400;
// 재질문 신호는 답변 말미에 있을 때만 인정한다(본문 중간의 "아래 중" 안내 문구 오탐 방지).
const REASKING_TAIL_LENGTH = 200;

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

  const trimmed = answer.trim();
  const substantial = trimmed.length >= SUBSTANTIAL_ANSWER_LENGTH;

  if (!substantial && UNCERTAIN_PHRASE.test(trimmed)) {
    return { needsHitl: true, reason: 'uncertain_phrasing' };
  }

  if (!substantial && NOT_FOUND_PHRASE.test(trimmed)) {
    return { needsHitl: true, reason: 'no_results' };
  }

  // 답변 자체가 "옵션을 고르라"는 재질문인 경우: 말미에 재질문 문구 + 선택지 불릿.
  // 근거 링크가 포함된 답변은 실질 안내가 이미 이뤄진 것이므로 제외한다.
  const bulletCount = (trimmed.match(BULLET_MARKERS) ?? []).length;
  const tail = trimmed.slice(-REASKING_TAIL_LENGTH);
  if (REASKING_PHRASE.test(tail) && bulletCount >= 2 && !LINK_PHRASE.test(trimmed)) {
    return { needsHitl: true, reason: 'reasking_with_options' };
  }

  return { needsHitl: false, reason: null };
}
