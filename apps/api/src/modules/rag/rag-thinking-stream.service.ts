import { Injectable } from '@nestjs/common';
import type { RagThinkPayload } from './thinking.types';

type ThinkEmitter = (payload: RagThinkPayload) => void;

@Injectable()
export class RagThinkingStreamService {
  private readonly emitters = new Map<string, ThinkEmitter>();

  register(traceId: string, emitter: ThinkEmitter) {
    this.emitters.set(traceId, emitter);
  }

  unregister(traceId: string, emitter?: ThinkEmitter) {
    const current = this.emitters.get(traceId);
    if (!current) return;
    if (emitter && current !== emitter) return;
    this.emitters.delete(traceId);
  }

  emit(traceId: string | null | undefined, payload: RagThinkPayload) {
    if (!traceId) return;
    const emitter = this.emitters.get(traceId);
    if (!emitter) return;
    emitter({ ...payload, traceId });
  }
}
