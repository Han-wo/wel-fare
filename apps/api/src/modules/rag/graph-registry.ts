import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseCheckpointSaver, Command } from '@langchain/langgraph';
import { createRagGraph, type RagGraphServices } from './rag.graph';
import { createEligibilityGraph } from './eligibility.graph';
import { createApplicationAssistGraph } from './application-assist.graph';
import { createPostApplicationGraph } from './post-application.graph';
import type { RagRouteType } from './query-analysis.service';

/**
 * 라우트 → 그래프 레지스트리.
 *
 * 새 그래프를 붙일 때 orchestrator를 건드리지 않고 여기에 한 줄 추가한다.
 * (라우팅 규칙은 QueryAnalysisService, 그래프 골격은 /scaffold-rag-graph 참고)
 *
 * 그래프마다 state 타입이 달라 invoke 입력은 공통 필드의 구조적 타입으로
 * 좁힌다 — orchestrator가 넘기는 필드는 모든 그래프 state의 부분집합이다.
 * HITL 재개 시에는 입력 대신 Command({resume})를 넘긴다.
 */
export interface RagGraphInvokeInput {
  question: string;
  userId: string;
  sessionId: string;
  traceId: string;
  messages: unknown[];
  profile: null;
  answer: string;
  hitlResumed: boolean;
}

export interface InvokableRagGraph {
  invoke(
    input: RagGraphInvokeInput | Command,
    config?: RunnableConfig,
  ): Promise<{ answer?: unknown }>;
}

const RAG_GRAPH_FACTORIES: ReadonlyArray<{
  routeType: RagRouteType;
  create: (services: RagGraphServices, checkpointer?: BaseCheckpointSaver) => unknown;
}> = [
  { routeType: 'SEARCH', create: createRagGraph },
  { routeType: 'ELIGIBILITY', create: createEligibilityGraph },
  { routeType: 'APPLICATION_ASSIST', create: createApplicationAssistGraph },
  { routeType: 'POST_APPLICATION', create: createPostApplicationGraph },
];

export const DEFAULT_ROUTE: RagRouteType = 'SEARCH';

export function buildRagGraphs(
  services: RagGraphServices,
  checkpointer?: BaseCheckpointSaver,
): Map<RagRouteType, InvokableRagGraph> {
  return new Map(
    RAG_GRAPH_FACTORIES.map((entry) => [
      entry.routeType,
      entry.create(services, checkpointer) as InvokableRagGraph,
    ]),
  );
}
