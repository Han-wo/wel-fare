import { Injectable } from '@nestjs/common';
import type { HitlQuestionnaire } from './hitl.types';

export interface AnswerStreamEmitters {
  onToken: (token: string) => void;
  onHitl: (questionnaire: HitlQuestionnaire) => void;
}

/**
 * 답변 토큰·HITL 설문의 traceId 기반 이벤트 버스 (RagThinkingStreamService와 동일 패턴).
 *
 * 콜백 함수를 그래프 state에 싣지 않기 위한 장치다. state는 checkpointer로
 * 직렬화되므로 함수를 담을 수 없다 — 노드는 services.emitToken/emitHitl(traceId, ...)만
 * 호출하고, orchestrator가 턴마다 여기 실제 emitter를 등록/해제한다.
 */
@Injectable()
export class RagAnswerStreamService {
  private readonly emitters = new Map<string, AnswerStreamEmitters>();

  register(traceId: string, emitters: AnswerStreamEmitters) {
    this.emitters.set(traceId, emitters);
  }

  unregister(traceId: string, emitters?: AnswerStreamEmitters) {
    const current = this.emitters.get(traceId);
    if (!current) return;
    if (emitters && current !== emitters) return;
    this.emitters.delete(traceId);
  }

  emitToken(traceId: string | null | undefined, token: string) {
    if (!traceId || !token) return;
    this.emitters.get(traceId)?.onToken(token);
  }

  emitHitl(traceId: string | null | undefined, questionnaire: HitlQuestionnaire) {
    if (!traceId) return;
    this.emitters.get(traceId)?.onHitl(questionnaire);
  }
}
