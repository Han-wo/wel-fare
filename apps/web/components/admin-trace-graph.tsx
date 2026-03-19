'use client';

import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowRight,
  Bot,
  Compass,
  FileSearch,
  MapPinned,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

interface TraceNode {
  id: string;
  label: string;
  kind: string;
  score?: number | null;
  meta?: unknown;
}

interface TraceEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  meta?: unknown;
}

interface TraceGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
}

type TracePhaseId = 'question' | 'route' | 'profile' | 'tool' | 'retrieval' | 'graph';

type TraceFlowData = {
  label: string;
  kindLabel: string;
  rawKind: string;
  score?: number | null;
  color: string;
  highlighted: boolean;
  iconKey: TracePhaseId | 'document';
};

type PhaseSummary = {
  id: TracePhaseId;
  label: string;
  description: string;
};

type KindMeta = {
  label: string;
  color: string;
  phase: TracePhaseId;
  iconKey: TraceFlowData['iconKey'];
};

const PHASES: PhaseSummary[] = [
  { id: 'question', label: '질문', description: '사용자 입력' },
  { id: 'route', label: '라우팅', description: '의도 분류' },
  { id: 'profile', label: '프로필', description: '사용자 맥락' },
  { id: 'tool', label: '도구 선택', description: '검색/판정 도구' },
  { id: 'retrieval', label: '검색 결과', description: '벡터·문서 후보' },
  { id: 'graph', label: '그래프 탐색', description: '확장 노드/관계' },
];

const PHASE_ICON_MAP: Record<TraceFlowData['iconKey'], LucideIcon> = {
  question: Sparkles,
  route: Compass,
  profile: UserRound,
  tool: Bot,
  retrieval: Search,
  graph: MapPinned,
  document: FileSearch,
};

const KIND_META: Record<string, KindMeta> = {
  question: {
    label: '질문',
    color: '#2f6f5b',
    phase: 'question',
    iconKey: 'question',
  },
  route: {
    label: '라우트',
    color: '#4f6ad7',
    phase: 'route',
    iconKey: 'route',
  },
  profile: {
    label: '프로필',
    color: '#6b8f79',
    phase: 'profile',
    iconKey: 'profile',
  },
  tool: {
    label: '도구',
    color: '#b37a32',
    phase: 'tool',
    iconKey: 'tool',
  },
  Policy: {
    label: '정책',
    color: '#265d8f',
    phase: 'retrieval',
    iconKey: 'retrieval',
  },
  HousingAnnouncement: {
    label: '주택 공고',
    color: '#5371b9',
    phase: 'retrieval',
    iconKey: 'retrieval',
  },
  HousingComplex: {
    label: '단지',
    color: '#7d69b6',
    phase: 'retrieval',
    iconKey: 'retrieval',
  },
  WelfareFacility: {
    label: '시설',
    color: '#3d8b83',
    phase: 'retrieval',
    iconKey: 'retrieval',
  },
  Document: {
    label: '문서',
    color: '#8896a8',
    phase: 'retrieval',
    iconKey: 'document',
  },
  LifeStage: {
    label: '생애주기',
    color: '#d88057',
    phase: 'graph',
    iconKey: 'graph',
  },
  TargetGroup: {
    label: '대상군',
    color: '#b86868',
    phase: 'graph',
    iconKey: 'graph',
  },
  Theme: {
    label: '테마',
    color: '#8a6dd1',
    phase: 'graph',
    iconKey: 'graph',
  },
  Region: {
    label: '지역',
    color: '#5f8c4d',
    phase: 'graph',
    iconKey: 'graph',
  },
};

const nodeTypes = {
  traceNode: TraceFlowNode,
};

export function AdminTraceGraph({
  graph,
  routeType,
  toolNames,
}: {
  graph: TraceGraph;
  routeType?: string | null;
  toolNames?: string[];
}) {
  if (graph.nodes.length === 0) {
    return (
      <div className="surface-soft rounded-[24px] px-4 py-5 text-sm text-[var(--text-secondary)]">
        표시할 그래프 노드가 아직 없습니다.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <TraceGraphCanvas graph={graph} routeType={routeType} toolNames={toolNames ?? []} />
    </ReactFlowProvider>
  );
}

function TraceGraphCanvas({
  graph,
  routeType,
  toolNames,
}: {
  graph: TraceGraph;
  routeType?: string | null;
  toolNames: string[];
}) {
  const defaultNodeId = useMemo(
    () => graph.nodes.find((node) => node.kind === 'question')?.id ?? graph.nodes[0]?.id ?? null,
    [graph.nodes],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(defaultNodeId);

  const nodeLookup = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  const activeNodeId =
    selectedNodeId && nodeLookup.has(selectedNodeId) ? selectedNodeId : defaultNodeId;
  const selectedNode = activeNodeId ? nodeLookup.get(activeNodeId) ?? null : null;

  const incomingEdges = useMemo(
    () => (activeNodeId ? graph.edges.filter((edge) => edge.target === activeNodeId) : []),
    [activeNodeId, graph.edges],
  );
  const outgoingEdges = useMemo(
    () => (activeNodeId ? graph.edges.filter((edge) => edge.source === activeNodeId) : []),
    [activeNodeId, graph.edges],
  );

  const phaseSummary = useMemo(
    () =>
      PHASES.map((phase) => ({
        ...phase,
        count: graph.nodes.filter((node) => resolveKindMeta(node.kind).phase === phase.id).length,
      })),
    [graph.nodes],
  );

  const flowGraph = useMemo(
    () => buildFlowGraph(graph, activeNodeId),
    [activeNodeId, graph],
  );

  return (
    <div className="space-y-4">
      <div className="surface-soft rounded-[24px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          {routeType ? <TracePill label="라우트" value={routeType} /> : null}
          {toolNames.slice(0, 4).map((toolName) => (
            <TracePill key={toolName} label="도구" value={toolName} />
          ))}
          <TracePill label="그래프" value={`${graph.nodes.length} 노드 · ${graph.edges.length} 엣지`} />
        </div>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          질문에서 어떤 라우트가 선택됐고, 어떤 도구가 검색 결과를 만들고, 이후 어떤 그래프 노드로
          확장됐는지 단계별로 추적합니다.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[24px] border border-[var(--panel-border)] bg-white/78">
          <div className="grid gap-px border-b border-[var(--panel-border)] bg-[var(--panel-border)] lg:grid-cols-6">
            {phaseSummary.map((phase) => {
              const activePhase = selectedNode
                ? resolveKindMeta(selectedNode.kind).phase === phase.id
                : false;
              return (
                <div
                  key={phase.id}
                  className={`bg-white/88 px-4 py-4 transition ${
                    activePhase ? 'bg-[var(--brand-soft)]' : ''
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {phase.label}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{phase.count}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{phase.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-[560px] bg-[radial-gradient(circle_at_top_left,rgba(47,111,91,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,252,0.88),rgba(247,242,234,0.94))]">
            <ReactFlow
              nodes={flowGraph.nodes}
              edges={flowGraph.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.35}
              maxZoom={1.6}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            >
              <Background color="rgba(124, 138, 157, 0.12)" gap={28} size={1} />
              <MiniMap
                pannable
                zoomable
                nodeStrokeColor={(node) => {
                  const color = (node.data as TraceFlowData | undefined)?.color;
                  return color ?? '#8896a8';
                }}
                nodeColor={(node) => {
                  const data = node.data as TraceFlowData | undefined;
                  return `${data?.color ?? '#8896a8'}22`;
                }}
                maskColor="rgba(244, 239, 230, 0.7)"
                className="!rounded-2xl !border !border-[var(--panel-border)] !bg-white/92"
              />
              <Controls
                showInteractive={false}
                className="!overflow-hidden !rounded-2xl !border !border-[var(--panel-border)] !bg-white/92"
              />
            </ReactFlow>
          </div>
        </div>

        <aside className="surface-soft rounded-[24px] p-4">
          {selectedNode ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  선택된 노드
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{selectedNode.label}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="badge-soft !text-[11px] uppercase">
                    {resolveKindMeta(selectedNode.kind).label}
                  </span>
                  <span className="badge-soft !text-[11px] uppercase">
                    {PHASES.find((phase) => phase.id === resolveKindMeta(selectedNode.kind).phase)?.label}
                  </span>
                  {typeof selectedNode.score === 'number' ? (
                    <span className="badge-soft !text-[11px]">score {selectedNode.score.toFixed(2)}</span>
                  ) : null}
                </div>
              </div>

              <TraceEdgeGroup
                title="들어온 경로"
                edges={incomingEdges}
                emptyText="이 노드로 들어오는 경로가 없습니다."
                nodeLookup={nodeLookup}
              />

              <TraceEdgeGroup
                title="다음 경로"
                edges={outgoingEdges}
                emptyText="이 노드에서 이어지는 다음 경로가 없습니다."
                nodeLookup={nodeLookup}
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  메타데이터
                </p>
                <pre className="mt-3 overflow-x-auto rounded-[18px] bg-[rgba(19,32,51,0.04)] px-3 py-3 text-xs leading-6 text-[var(--text-secondary)]">
                  {formatJson(selectedNode.meta)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-secondary)]">선택된 노드가 없습니다.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TraceFlowNode({ data, selected }: NodeProps<Node<TraceFlowData>>) {
  const color = data.color;
  const Icon = PHASE_ICON_MAP[data.iconKey];

  return (
    <div
      className="min-w-[220px] rounded-[22px] border bg-white/94 px-4 py-3 shadow-[0_10px_22px_rgba(20,31,45,0.08)] backdrop-blur"
      style={{
        borderColor: selected ? color : data.highlighted ? `${color}99` : `${color}55`,
        boxShadow: selected
          ? `0 0 0 2px ${color}24, 0 18px 32px rgba(20, 31, 45, 0.14)`
          : data.highlighted
            ? '0 14px 26px rgba(20,31,45,0.10)'
            : '0 10px 22px rgba(20,31,45,0.08)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0"
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <Icon size={14} />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {data.kindLabel}
          </span>
        </div>
        {typeof data.score === 'number' ? (
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {data.score.toFixed(2)}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-primary)]">{data.label}</p>
    </div>
  );
}

function TracePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-white/78 px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <span className="font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

function TraceEdgeGroup({
  title,
  edges,
  emptyText,
  nodeLookup,
}: {
  title: string;
  edges: TraceEdge[];
  emptyText: string;
  nodeLookup: Map<string, TraceNode>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</p>
      {edges.length > 0 ? (
        <div className="mt-3 space-y-2">
          {edges.map((edge) => {
            const sourceLabel = nodeLookup.get(edge.source)?.label ?? edge.source;
            const targetLabel = nodeLookup.get(edge.target)?.label ?? edge.target;

            return (
              <div
                key={edge.id}
                className="rounded-[18px] border border-[var(--panel-border)] bg-white/74 px-3 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {formatEdgeLabel(edge.label)}
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                  <span className="truncate">{truncate(sourceLabel, 32)}</span>
                  <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate">{truncate(targetLabel, 32)}</span>
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{emptyText}</p>
      )}
    </div>
  );
}

function buildFlowGraph(graph: TraceGraph, activeNodeId: string | null) {
  const groups = new Map<TracePhaseId, TraceNode[]>();
  const highlightedNodeIds = activeNodeId ? collectHighlightedNodes(graph.edges, activeNodeId) : new Set<string>();
  const highlightedEdgeIds = activeNodeId
    ? collectHighlightedEdges(graph.edges, highlightedNodeIds)
    : new Set<string>();

  for (const node of graph.nodes) {
    const phase = resolveKindMeta(node.kind).phase;
    const bucket = groups.get(phase) ?? [];
    bucket.push(node);
    groups.set(phase, bucket);
  }

  const nodes: Node<TraceFlowData>[] = [];

  PHASES.forEach((phase, columnIndex) => {
    const bucket = (groups.get(phase.id) ?? []).toSorted(compareTraceNodes);
    const rowGap = phase.id === 'question' || phase.id === 'route' ? 138 : 118;
    const columnHeight = Math.max(bucket.length * rowGap, 148);
    const offsetY = Math.max((560 - columnHeight) / 2, 32);

    bucket.forEach((node, rowIndex) => {
      const meta = resolveKindMeta(node.kind);
      nodes.push({
        id: node.id,
        type: 'traceNode',
        position: {
          x: 40 + columnIndex * 280,
          y: offsetY + rowIndex * rowGap,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: true,
        data: {
          label: truncate(node.label, 56),
          kindLabel: meta.label,
          rawKind: node.kind,
          score: node.score ?? null,
          color: meta.color,
          highlighted: highlightedNodeIds.has(node.id),
          iconKey: meta.iconKey,
        },
        zIndex: activeNodeId === node.id ? 3 : highlightedNodeIds.has(node.id) ? 2 : 1,
      });
    });
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const highlighted = highlightedEdgeIds.has(edge.id);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: highlighted ? '#2f6f5b' : 'rgba(82,99,121,0.32)',
      },
      label: truncate(formatEdgeLabel(edge.label), 18),
      labelStyle: {
        fill: highlighted ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 10,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: 'rgba(255,255,252,0.9)',
        fillOpacity: 1,
      },
      labelBgPadding: [6, 3],
      style: {
        stroke: highlighted ? 'rgba(47,111,91,0.72)' : 'rgba(82,99,121,0.24)',
        strokeWidth: highlighted ? 2.1 : 1.2,
      },
      animated: highlighted,
      selectable: false,
    };
  });

  return { nodes, edges };
}

function collectHighlightedNodes(edges: TraceEdge[], activeNodeId: string) {
  const nodes = new Set<string>([activeNodeId]);
  const stack = [activeNodeId];

  while (stack.length > 0) {
    const current = stack.pop()!;

    for (const edge of edges) {
      if (edge.target === current && !nodes.has(edge.source)) {
        nodes.add(edge.source);
        stack.push(edge.source);
      }
      if (edge.source === current && !nodes.has(edge.target)) {
        nodes.add(edge.target);
      }
    }
  }

  return nodes;
}

function collectHighlightedEdges(edges: TraceEdge[], highlightedNodeIds: Set<string>) {
  const highlightedEdgeIds = new Set<string>();

  for (const edge of edges) {
    if (highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target)) {
      highlightedEdgeIds.add(edge.id);
    }
  }

  return highlightedEdgeIds;
}

function compareTraceNodes(a: TraceNode, b: TraceNode) {
  const scoreA = typeof a.score === 'number' ? a.score : -1;
  const scoreB = typeof b.score === 'number' ? b.score : -1;

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  return a.label.localeCompare(b.label, 'ko');
}

function resolveKindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? KIND_META.Document;
}

function formatEdgeLabel(value: string) {
  const labelMap: Record<string, string> = {
    ROUTED_TO: '라우팅',
    USES_PROFILE: '프로필 사용',
    PRE_ROUTE: '프리라우팅',
    AGENT: '에이전트 호출',
    VECTOR_HIT: '벡터 검색 히트',
  };

  return labelMap[value] ?? value.replace(/_/g, ' ');
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatJson(value: unknown) {
  if (value == null) return '없음';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
