import { Injectable } from '@nestjs/common';
import type {
  RagTraceEdge,
  RagTraceEvent,
  RagTraceNode,
  RagTraceStatus,
} from './entities/rag-trace.entity';
import { RagTraceService } from './rag-trace.service';

type TraceEventInput = Omit<RagTraceEvent, 'id' | 'at'>;

@Injectable()
export class TraceFacade {
  constructor(private readonly ragTrace: RagTraceService) {}

  startTrace(input: {
    sessionId: string;
    userId: string;
    question: string;
    model?: string | null;
  }) {
    return this.ragTrace.startTrace(input);
  }

  finalizeTrace(
    traceId: string,
    input: {
      status: Exclude<RagTraceStatus, 'RUNNING'>;
      answer?: string | null;
      error?: string | null;
    },
  ) {
    return this.ragTrace.finalizeTrace(traceId, input);
  }

  setRouteType(traceId: string, input: { routeType: string; detail: string }) {
    this.ragTrace.setRouteType(traceId, input);
  }

  recordContext(
    traceId: string,
    input: { historyCount: number; profileSummary: Record<string, unknown> | null },
  ) {
    this.ragTrace.recordContext(traceId, input);
  }

  addEvent(traceId: string, input: TraceEventInput) {
    this.ragTrace.addEvent(traceId, input);
  }

  recordToolSelection(
    traceId: string,
    input: {
      source: 'PRE_ROUTE' | 'AGENT' | 'RETRY';
      toolName: string;
      args: Record<string, unknown>;
      detail: string;
    },
  ) {
    this.ragTrace.recordToolSelection(traceId, input);
  }

  recordVectorSearch(
    traceId: string,
    input: {
      title: string;
      query: string;
      hits: Array<{
        id: string;
        label: string;
        kind: string;
        score?: number | null;
        source?: string | null;
        meta?: unknown;
      }>;
      filter?: unknown;
    },
  ) {
    this.ragTrace.recordVectorSearch(traceId, input);
  }

  recordGraphWalk(
    traceId: string,
    input: {
      title: string;
      detail: string;
      nodes: RagTraceNode[];
      edges: RagTraceEdge[];
      payload?: unknown;
    },
  ) {
    this.ragTrace.recordGraphWalk(traceId, input);
  }

  recordAnswer(traceId: string, answer: string) {
    this.ragTrace.recordAnswer(traceId, answer);
  }

  recordError(traceId: string, message: string) {
    this.ragTrace.recordError(traceId, message);
  }
}
