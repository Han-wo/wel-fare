import type { RagRouteType } from './query-analysis.service';

/**
 * HITL 중단-재개의 순수 로직.
 *
 * 클래리피케이션(HITL)으로 턴이 끝날 때 assistant 메시지의 ragContext.hitl에
 * "무엇을 묻다 멈췄는지"(원래 질문·라우트)를 실어둔다. 다음 사용자 메시지가
 * HITL 보충 답변이면 처음부터 재라우팅하는 대신:
 *
 *  1. 원래 질문의 라우트를 복원하고 (보충 답변엔 의도 키워드가 없어
 *     기본값 SEARCH로 잘못 떨어지는 문제 방지)
 *  2. 원래 질문 + 보충 정보를 병합해 그래프에 넘기고
 *  3. hitlResumed 플래그로 재클래리피케이션을 억제한다 (ask-at-most-once).
 *
 * LangGraph checkpointer 대신 앱 레벨 재개를 쓰는 이유: 그래프 state에
 * streamCallback/hitlCallback 함수가 있어 체크포인트 직렬화가 불가하고,
 * 중단 깊이가 1이라 "결정된 것(질문·라우트)만 보존하고 검색은 다시 실행"으로
 * 충분하다. 중단 전 검색 결과는 부족 판정을 받은 것이라 보존 가치가 없다.
 */
export interface PendingHitl {
  originalQuestion: string;
  routeType: RagRouteType;
  reason: string;
  source: string;
  questionnaireId?: string;
  missingFields?: string[];
}

export interface HitlResumeDecision {
  routeType: RagRouteType;
  effectiveQuestion: string;
  supplement: string;
  skipped: boolean;
}

// 그래프 노드가 클래리피케이션 저장 시 hitlMeta로 넘기는 페이로드를 만든다.
export function buildPendingHitlMeta(pending: PendingHitl): Record<string, unknown> {
  return { hitl: { ...pending } };
}

export function extractPendingHitl(ragContext: unknown): PendingHitl | null {
  if (!ragContext || typeof ragContext !== 'object') return null;
  const hitl = (ragContext as { hitl?: unknown }).hitl;
  if (!hitl || typeof hitl !== 'object') return null;

  const candidate = hitl as Partial<PendingHitl>;
  if (
    typeof candidate.originalQuestion !== 'string' ||
    !candidate.originalQuestion.trim() ||
    (candidate.routeType !== 'SEARCH' &&
      candidate.routeType !== 'ELIGIBILITY' &&
      candidate.routeType !== 'APPLICATION_ASSIST')
  ) {
    // 구버전 메타(originalQuestion/routeType 없음)는 재개 대상이 아니다.
    return null;
  }

  return {
    originalQuestion: candidate.originalQuestion,
    routeType: candidate.routeType,
    reason: typeof candidate.reason === 'string' ? candidate.reason : 'unknown',
    source: typeof candidate.source === 'string' ? candidate.source : 'unknown',
    questionnaireId: candidate.questionnaireId,
    missingFields: candidate.missingFields,
  };
}

// 프론트 hitl-panel composeAnswerText가 만드는 고정 문형.
const PANEL_ANSWER_RE = /^방금 확인한 정보로 다시 찾아주세요\s*[—-]?\s*(.*)$/s;
const PANEL_SKIP_RE = /^방금 답변은 건너뛸게요/;

// 채팅 입력창에 직접 친 짧은 보충 답변("만 27세, 서울 살아요") 판별용.
// 필드 값 패턴이 있고, 새 질문으로 보이는 표현이 없어야 한다.
const FIELD_VALUE_RE =
  /(만\s*)?\d{1,2}\s*세|\d{1,2}\s*대|(19|20)\d{2}\s*년생|무주택|자가|전세|월세|임차|중위소득|기초생활|차상위|저소득|(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;
const FRESH_QUESTION_RE = /알려|찾아|보여|뭐|무엇|어떤|어디|언제|추천|지원금|정책|공고|신청|\?/;
const FREE_TEXT_SUPPLEMENT_MAX_LENGTH = 40;

export function resolveHitlResume(
  pending: PendingHitl | null,
  incomingMessage: string,
): HitlResumeDecision | null {
  if (!pending) return null;
  const incoming = incomingMessage.trim();
  if (!incoming) return null;

  if (PANEL_SKIP_RE.test(incoming)) {
    return {
      routeType: pending.routeType,
      effectiveQuestion: pending.originalQuestion,
      supplement: '',
      skipped: true,
    };
  }

  const panelMatch = incoming.match(PANEL_ANSWER_RE);
  if (panelMatch) {
    const supplement = panelMatch[1].trim();
    return {
      routeType: pending.routeType,
      effectiveQuestion: mergeQuestion(pending.originalQuestion, supplement),
      supplement,
      skipped: supplement.length === 0,
    };
  }

  const looksLikeSupplement =
    incoming.length <= FREE_TEXT_SUPPLEMENT_MAX_LENGTH &&
    FIELD_VALUE_RE.test(incoming) &&
    !FRESH_QUESTION_RE.test(incoming);
  if (looksLikeSupplement) {
    return {
      routeType: pending.routeType,
      effectiveQuestion: mergeQuestion(pending.originalQuestion, incoming),
      supplement: incoming,
      skipped: false,
    };
  }

  return null;
}

function mergeQuestion(originalQuestion: string, supplement: string): string {
  if (!supplement) return originalQuestion;
  return `${originalQuestion}\n[사용자 보충 정보] ${supplement}`;
}
