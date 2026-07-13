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
 * 재개 경로는 두 가지다:
 *  - threadId가 있으면(신규): LangGraph checkpointer 스레드를
 *    Command({resume})로 이어서 실행한다 (hitl-interrupt.ts).
 *  - threadId가 없으면(구버전 메시지·체크포인트 유실): 원래 질문·라우트만 복원해
 *    그래프를 처음부터 다시 실행하는 앱 레벨 폴백을 탄다.
 */
export interface PendingHitl {
  originalQuestion: string;
  routeType: RagRouteType;
  reason: string;
  source: string;
  questionnaireId?: string;
  missingFields?: string[];
  /** 중단된 LangGraph 체크포인트 스레드(=해당 턴의 traceId). */
  threadId?: string;
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
      candidate.routeType !== 'APPLICATION_ASSIST' &&
      candidate.routeType !== 'POST_APPLICATION')
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
    threadId: typeof candidate.threadId === 'string' ? candidate.threadId : undefined,
  };
}

/**
 * 구조화 HITL 답변 (신규 계약).
 *
 * 프론트 hitl-panel이 만드는 Answers 맵을 `hitl` 쿼리 파라미터로 직접 받는다.
 * 이 경로가 있으면 아래 문형 역파싱(resolveHitlResume)은 타지 않는다 —
 * 문형 매칭은 구클라이언트 호환용 폴백으로만 남는다.
 */
export type StructuredHitlAnswer = { value: string; label: string } | 'skipped';
export type StructuredHitlAnswers = Record<string, StructuredHitlAnswer>;

// hitl-panel labelForField와 동일한 라벨. 병합 질문 문구를 기존 문형과 맞춘다.
const FIELD_LABELS: Record<string, string> = {
  policy_name: '정책명',
  region: '지역',
  age: '나이대',
  income: '소득',
  housing: '주거',
  category: '분야',
};

// 세션을 넘어 지속 저장할 프로필 사실 필드 (정책명/분야는 질문 단위 문맥).
const FACT_FIELD_KEYS = ['region', 'age', 'income', 'housing'] as const;

export function parseStructuredHitlAnswers(raw: string | undefined | null): StructuredHitlAnswers | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const answers: StructuredHitlAnswers = {};
    for (const [fieldKey, answer] of Object.entries(parsed as Record<string, unknown>)) {
      if (answer === 'skipped') {
        answers[fieldKey] = 'skipped';
        continue;
      }
      if (
        answer &&
        typeof answer === 'object' &&
        typeof (answer as { label?: unknown }).label === 'string'
      ) {
        answers[fieldKey] = {
          value: String((answer as { value?: unknown }).value ?? ''),
          label: (answer as { label: string }).label,
        };
      }
    }
    return Object.keys(answers).length > 0 ? answers : null;
  } catch {
    return null;
  }
}

// 구조화 답변 → 재개 결정. 문형 파싱 없이 결정적으로 동작한다.
export function resolveHitlResumeFromAnswers(
  pending: PendingHitl | null,
  answers: StructuredHitlAnswers,
): HitlResumeDecision | null {
  if (!pending) return null;

  const answered = Object.entries(answers).filter(
    (entry): entry is [string, { value: string; label: string }] => entry[1] !== 'skipped',
  );

  if (answered.length === 0) {
    return {
      routeType: pending.routeType,
      effectiveQuestion: pending.originalQuestion,
      supplement: '',
      skipped: true,
    };
  }

  const supplement = answered
    .map(([fieldKey, answer]) => `${FIELD_LABELS[fieldKey] ?? fieldKey}: ${answer.label}`)
    .join(', ');

  return {
    routeType: pending.routeType,
    effectiveQuestion: mergeQuestion(pending.originalQuestion, supplement),
    supplement,
    skipped: false,
  };
}

// 구조화 답변에서 지속 프로필 사실을 직접 추출한다 (문자열 파싱 불필요).
export function extractFactsFromAnswers(
  answers: StructuredHitlAnswers,
): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const fieldKey of FACT_FIELD_KEYS) {
    const answer = answers[fieldKey];
    if (answer && answer !== 'skipped' && answer.label.trim()) {
      facts[fieldKey] = answer.label.trim();
    }
  }
  return facts;
}

// 프론트 hitl-panel composeAnswerText가 만드는 고정 문형 (구클라이언트 폴백).
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

export function mergeQuestion(originalQuestion: string, supplement: string): string {
  if (!supplement) return originalQuestion;
  return `${originalQuestion}\n[사용자 보충 정보] ${supplement}`;
}
