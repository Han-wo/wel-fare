const REASKING_PHRASE =
  /(번호(를)?\s*(골라|선택|알려|말씀)|어느\s*(것|항목|분야)|아래\s*중(에서)?|원하시는\s*(번호|항목|분야|것|다음)|선택\s*해\s*주세요|골라주시면|몇\s*번|다음\s*중\s*어느)/;

// 답변이 "(A)/(B)/(C) 중 하나를 알려주시면"처럼 선택 메뉴를 제시하고 사용자의
// 선택을 기다리는 형태. 이건 답변이 아니라 재질문이므로 HITL 설문으로 바꿔야 한다.
// 영문 괄호 선택지는 일반 산문에 거의 나오지 않아 오탐이 적다.
const LETTERED_OPTION = /[(（]\s*[A-Z]\s*[)）]/g;
const CHOICE_REQUEST =
  /(중\s*(하나|한\s*가지)를?\s*(알려|선택|골라|말씀)|어느\s*쪽|원하시는\s*(다음\s*)?(단계|방법|작업)|알려주시면\s*(제가|바로|근거)|대신\s*해\s*드립니다)/;
const MIN_LETTERED_OPTIONS = 2;
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

  // 선택 메뉴형 재질문: "(A)…(B)…(C) 중 하나를 알려주시면".
  // 위치·길이·링크 유무와 무관하게 판정한다. 근거 링크가 있는 긴 답변이라도
  // 마지막에 사용자의 선택을 기다린다면 그건 완결된 답변이 아니다
  // (요약·부록이 뒤에 붙어 재질문 문구가 꼬리 200자를 벗어나는 경우가 흔하다).
  const letteredOptions = new Set(trimmed.match(LETTERED_OPTION) ?? []);
  if (letteredOptions.size >= MIN_LETTERED_OPTIONS && CHOICE_REQUEST.test(trimmed)) {
    return { needsHitl: true, reason: 'reasking_with_options' };
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
