import { interrupt } from '@langchain/langgraph';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { HitlQuestionnaire } from './hitl.types';
import { mergeQuestion, type PendingHitl } from './hitl-resume';
import type { RagThinkPayload } from './thinking.types';

/**
 * LangGraph 네이티브 HITL 중단-재개.
 *
 * 클래리피케이션이 필요하다고 판단한 노드(request_missing_info / collect_* /
 * verify_answer / request_clarification)는 설문·프롬프트를 직접 내보낸 뒤
 * state.pendingHitl만 채운다. 라우팅이 save_hitl_message(클래리피케이션 메시지
 * 저장) → await_hitl로 이어지고, await_hitl이 interrupt()로 그래프를 멈춘다.
 *
 * 다음 사용자 메시지가 보충 답변이면 orchestrator가 같은 thread_id로
 * Command({ resume: HitlResumeValue })를 invoke해 await_hitl부터 재개한다.
 * interrupt() 앞의 부수효과는 재개 시 다시 실행되므로, await_hitl은
 * interrupt()를 첫 문장으로 두는 전용 노드로 분리되어 있다.
 */
export interface HitlInterruptPayload {
  questionnaire: HitlQuestionnaire;
  pending: PendingHitl;
}

export interface HitlResumeValue {
  /** 사용자 보충 정보 텍스트. skipped면 빈 문자열. */
  supplement: string;
  skipped: boolean;
  /** 재개된 턴의 새 traceId. 이후 노드의 이벤트·토큰이 새 trace로 흐르게 한다. */
  traceId?: string;
}

/** await_hitl 노드가 다루는 공통 채널 — 4개 그래프 state 모두 이 필드를 가진다. */
export interface AwaitHitlChannels {
  messages: BaseMessage[];
  question: string;
  traceId: string;
  answer: string;
  skipSave: boolean;
  hitlResumed: boolean;
  hitlMeta: Record<string, unknown> | null;
  pendingHitl: HitlInterruptPayload | null;
}

export function createAwaitHitlNode<TState extends AwaitHitlChannels>(services: {
  emitThink: (traceId: string, input: RagThinkPayload) => void;
}) {
  return function awaitHitl(state: TState): Partial<AwaitHitlChannels> {
    // 첫 실행: 여기서 멈추고 pendingHitl을 밖에 노출. 재개: resume 값을 돌려받는다.
    const resume = interrupt(state.pendingHitl ?? {}) as HitlResumeValue | undefined;

    const supplement = resume?.skipped ? '' : (resume?.supplement ?? '').trim();
    const traceId = resume?.traceId?.trim() ? resume.traceId : state.traceId;

    services.emitThink(traceId, {
      phase: 'HITL 재개',
      content: supplement
        ? `보충 답변(${supplement})을 반영해 이어서 진행합니다.`
        : '재질문을 건너뛰고 기존 정보로 이어서 진행합니다.',
      node: 'await_hitl',
      status: 'done',
    });

    return {
      question: supplement ? mergeQuestion(state.question, supplement) : state.question,
      traceId,
      hitlResumed: true, // ask-at-most-once: 재개된 턴은 재질문 없이 끝까지 간다.
      pendingHitl: null,
      // 클래리피케이션 턴이 남긴 answer/hitlMeta를 지워 라우팅 오판을 막는다.
      answer: '',
      skipSave: false,
      hitlMeta: null,
      messages: supplement ? [new HumanMessage(`[사용자 보충 정보] ${supplement}`)] : [],
    };
  };
}
