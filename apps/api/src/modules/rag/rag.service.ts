import { Injectable } from '@nestjs/common';
import { RagOrchestratorService } from './rag-orchestrator.service';
import { RetrieverServices } from './retriever-services.service';
import type { RagStreamEvent } from './streaming.service';

@Injectable()
export class RagService {
  constructor(
    private readonly orchestrator: RagOrchestratorService,
    private readonly retrievers: RetrieverServices,
  ) {}

  streamAnswer(
    userId: string,
    sessionId: string,
    question: string,
    hitlAnswers?: string,
  ): AsyncGenerator<RagStreamEvent> {
    return this.orchestrator.streamAnswer(userId, sessionId, question, hitlAnswers);
  }

  getSuggestions(userId: string) {
    return this.retrievers.getSuggestions(userId);
  }
}

export type { RagStreamEvent } from './streaming.service';
