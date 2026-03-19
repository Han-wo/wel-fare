import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  RagTrace,
  type RagTraceEdge,
  type RagTraceEvent,
  type RagTraceGraph,
  type RagTraceNode,
  type RagTraceStatus,
} from './entities/rag-trace.entity';

type RagTraceDraft = {
  id: string;
  sessionId: string;
  userId: string;
  question: string;
  answer?: string | null;
  status: RagTraceStatus;
  routeType?: string | null;
  model?: string | null;
  toolNames: Set<string>;
  events: RagTraceEvent[];
  nodes: Map<string, RagTraceNode>;
  edges: Map<string, RagTraceEdge>;
  startedAt: string;
  summary?: string | null;
  error?: string | null;
};

type RecordEventInput = Omit<RagTraceEvent, 'id' | 'at'>;

type VectorHit = {
  id: string;
  label: string;
  kind: string;
  score?: number | null;
  source?: string | null;
  meta?: unknown;
};

@Injectable()
export class RagTraceService {
  private readonly drafts = new Map<string, RagTraceDraft>();
  private readonly persistChains = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(RagTrace)
    private readonly traceRepo: Repository<RagTrace>,
  ) {}

  startTrace(input: {
    sessionId: string;
    userId: string;
    question: string;
    model?: string | null;
  }) {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const questionNodeId = this.questionNodeId(id);

    const draft: RagTraceDraft = {
      id,
      sessionId: input.sessionId,
      userId: input.userId,
      question: input.question,
      status: 'RUNNING',
      model: input.model ?? null,
      toolNames: new Set(),
      events: [],
      nodes: new Map([[questionNodeId, { id: questionNodeId, label: truncate(input.question, 72), kind: 'question' }]]),
      edges: new Map(),
      startedAt,
    };

    this.drafts.set(id, draft);
    this.enqueuePersist(id);
    this.recordEvent(id, {
      type: 'session',
      title: '질문 추적 시작',
      detail: 'RAG 파이프라인 추적을 시작했습니다.',
      payload: { sessionId: input.sessionId, userId: input.userId },
    });
    return id;
  }

  recordContext(
    traceId: string,
    input: {
      historyCount: number;
      profileSummary: Record<string, unknown> | null;
    },
  ) {
    this.recordEvent(traceId, {
      type: 'context',
      title: '대화 컨텍스트 로드',
      detail: `이전 메시지 ${input.historyCount}개, 프로필 ${input.profileSummary ? '있음' : '없음'}`,
      payload: input,
    });

    if (!input.profileSummary) return;

    const profileNodeId = `profile:${traceId}`;
    this.mergeNodes(traceId, [
      {
        id: profileNodeId,
        label: '사용자 프로필',
        kind: 'profile',
        meta: input.profileSummary,
      },
    ]);

    this.mergeEdges(traceId, [
      {
        id: `question:${traceId}->${profileNodeId}:USES_PROFILE`,
        source: this.questionNodeId(traceId),
        target: profileNodeId,
        label: 'USES_PROFILE',
      },
    ]);
  }

  addEvent(traceId: string, input: RecordEventInput) {
    this.recordEvent(traceId, input);
  }

  setRouteType(
    traceId: string,
    input: {
      routeType: string;
      detail: string;
    },
  ) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;

    draft.routeType = input.routeType;
    const routeNodeId = `route:${traceId}:${input.routeType}`;

    this.mergeNodes(traceId, [
      {
        id: routeNodeId,
        label: input.routeType,
        kind: 'route',
      },
    ]);

    this.mergeEdges(traceId, [
      {
        id: `${this.questionNodeId(traceId)}->${routeNodeId}:ROUTED_TO`,
        source: this.questionNodeId(traceId),
        target: routeNodeId,
        label: 'ROUTED_TO',
      },
    ]);

    this.recordEvent(traceId, {
      type: 'decision',
      title: '라우트 결정',
      detail: input.detail,
      payload: { routeType: input.routeType },
    });
  }

  recordToolSelection(
    traceId: string,
    input: {
      source: 'PRE_ROUTE' | 'AGENT';
      toolName: string;
      args: Record<string, unknown>;
      detail: string;
    },
  ) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;

    draft.toolNames.add(input.toolName);
    draft.routeType ??= input.source;

    const toolNodeId = `tool:${traceId}:${input.toolName}`;
    this.mergeNodes(traceId, [
      {
        id: toolNodeId,
        label: input.toolName,
        kind: 'tool',
        meta: { source: input.source, args: input.args },
      },
    ]);

    this.mergeEdges(traceId, [
      {
        id: `${this.questionNodeId(traceId)}->${toolNodeId}:${input.source}`,
        source: this.questionNodeId(traceId),
        target: toolNodeId,
        label: input.source,
      },
    ]);

    this.recordEvent(traceId, {
      type: 'decision',
      title: `${input.source === 'PRE_ROUTE' ? '프리라우팅' : 'LLM'} 도구 선택`,
      detail: input.detail,
      payload: { toolName: input.toolName, args: input.args, source: input.source },
    });
  }

  recordVectorSearch(
    traceId: string,
    input: {
      title: string;
      query: string;
      hits: VectorHit[];
      filter?: unknown;
    },
  ) {
    this.recordEvent(traceId, {
      type: 'vector_search',
      title: input.title,
      detail: `${input.hits.length}개의 후보 문서를 찾았습니다.`,
      payload: {
        query: input.query,
        filter: input.filter ?? null,
        hits: input.hits,
      },
    });

    const nodes = input.hits.map((hit) => ({
      id: hit.id,
      label: hit.label,
      kind: hit.kind,
      score: hit.score ?? null,
      meta: { source: hit.source ?? null, ...asRecord(hit.meta) },
    }));
    this.mergeNodes(traceId, nodes);
    this.mergeEdges(
      traceId,
      input.hits.map((hit) => ({
        id: `${this.questionNodeId(traceId)}->${hit.id}:VECTOR_HIT`,
        source: this.questionNodeId(traceId),
        target: hit.id,
        label: 'VECTOR_HIT',
        meta: { score: hit.score ?? null, source: hit.source ?? null },
      })),
    );
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
    this.recordEvent(traceId, {
      type: 'graph_walk',
      title: input.title,
      detail: input.detail,
      payload: input.payload ?? null,
    });
    this.mergeNodes(traceId, input.nodes);
    this.mergeEdges(traceId, input.edges);
  }

  recordAnswer(traceId: string, answer: string) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;
    draft.answer = answer;
    this.recordEvent(traceId, {
      type: 'answer',
      title: '최종 답변 생성',
      detail: truncate(answer.replace(/\s+/g, ' ').trim(), 140),
    });
  }

  recordError(traceId: string, message: string) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;
    draft.error = message;
    this.recordEvent(traceId, {
      type: 'error',
      title: '파이프라인 오류',
      detail: truncate(message, 240),
    });
  }

  async finalizeTrace(
    traceId: string,
    input: {
      status: Exclude<RagTraceStatus, 'RUNNING'>;
      answer?: string | null;
      error?: string | null;
    },
  ) {
    const draft = this.drafts.get(traceId);
    if (!draft) return null;

    if (input.answer) {
      draft.answer = input.answer;
    }
    if (input.error) {
      draft.error = input.error;
    }
    draft.status = input.status;

    await this.flushPersist(traceId);
    const entity = await this.persistDraft(traceId);
    this.drafts.delete(traceId);
    this.persistChains.delete(traceId);
    return entity;
  }

  async getRecentTraces(limit = 20, sessionId?: string) {
    const take = Math.min(Math.max(limit, 1), 50);
    const where = sessionId ? { sessionId } : {};

    return this.traceRepo.find({
      where,
      order: { startedAt: 'DESC' },
      take,
      select: [
        'id',
        'sessionId',
        'userId',
        'question',
        'answer',
        'status',
        'routeType',
        'model',
        'toolNames',
        'summary',
        'error',
        'startedAt',
        'finishedAt',
        'durationMs',
      ],
    });
  }

  async getTrace(id: string) {
    const trace = await this.traceRepo.findOne({ where: { id } });
    if (!trace) {
      throw new NotFoundException('추적 로그를 찾을 수 없습니다.');
    }
    return trace;
  }

  private recordEvent(traceId: string, input: RecordEventInput) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;

    draft.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      ...input,
    });
    this.enqueuePersist(traceId);
  }

  private mergeNodes(traceId: string, nodes: RagTraceNode[]) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;

    for (const node of nodes) {
      if (!node.id) continue;
      const existing = draft.nodes.get(node.id);
      draft.nodes.set(node.id, existing ? { ...existing, ...node } : node);
    }
    this.enqueuePersist(traceId);
  }

  private mergeEdges(traceId: string, edges: RagTraceEdge[]) {
    const draft = this.drafts.get(traceId);
    if (!draft) return;

    for (const edge of edges) {
      if (!edge.id) continue;
      draft.edges.set(edge.id, edge);
    }
    this.enqueuePersist(traceId);
  }

  private questionNodeId(traceId: string) {
    return `question:${traceId}`;
  }

  private enqueuePersist(traceId: string) {
    const next = (this.persistChains.get(traceId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await this.persistDraft(traceId);
      })
      .catch(() => undefined);

    this.persistChains.set(traceId, next);
  }

  private async flushPersist(traceId: string) {
    await (this.persistChains.get(traceId) ?? Promise.resolve());
  }

  private async persistDraft(traceId: string) {
    const draft = this.drafts.get(traceId);
    if (!draft) {
      return null;
    }

    const startedAt = new Date(draft.startedAt);
    const finishedAt = draft.status === 'RUNNING' ? null : new Date();

    const entity = this.traceRepo.create({
      id: draft.id,
      sessionId: draft.sessionId,
      userId: draft.userId,
      question: draft.question,
      answer: draft.answer ?? null,
      status: draft.status,
      routeType: draft.routeType ?? null,
      model: draft.model ?? null,
      toolNames: [...draft.toolNames],
      events: draft.events,
      graph: {
        nodes: [...draft.nodes.values()],
        edges: [...draft.edges.values()],
      } satisfies RagTraceGraph,
      summary: buildSummary(draft, draft.status),
      error: draft.error ?? null,
      startedAt,
      finishedAt,
      durationMs: finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
    });

    return this.traceRepo.save(entity);
  }
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function buildSummary(draft: RagTraceDraft, status: RagTraceStatus) {
  if (status === 'RUNNING') {
    if (draft.toolNames.size > 0) {
      return `실행 중 · ${[...draft.toolNames].join(', ')} · 이벤트 ${draft.events.length}개`;
    }
    return `실행 중 · 이벤트 ${draft.events.length}개`;
  }

  if (status === 'FAILED') {
    return draft.error ? truncate(draft.error, 160) : 'RAG 파이프라인 실행 중 오류가 발생했습니다.';
  }

  if (status === 'ABORTED') {
    return '사용자가 스트리밍 세션을 종료해 추적이 중단되었습니다.';
  }

  if (draft.toolNames.size > 0) {
    return `${[...draft.toolNames].join(', ')} 사용 · 이벤트 ${draft.events.length}개`;
  }

  return `도구 선택 없이 응답 생성 · 이벤트 ${draft.events.length}개`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
