'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Bot,
  ChevronDown,
  Clock,
  FileText,
  Network,
  Search,
  Workflow,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { parseServerDate, formatRelativeKoreanTime } from '../../../lib/datetime';
import { useUserStore } from '../../../store/user.store';
import { MarkdownMessage } from '../../../components/markdown';
import { AdminSidebar, AdminTopbar } from '../../../components/layout/admin-sidebar';
import { AdminTraceGraph } from '../../../components/admin-trace-graph';
import { StatusPill, type PipelineStatus } from '../../../components/ui/status-pill';

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

interface TraceEvent {
  id: string;
  type:
    | 'session'
    | 'context'
    | 'decision'
    | 'vector_search'
    | 'graph_walk'
    | 'answer'
    | 'error';
  title: string;
  detail?: string | null;
  at: string;
  payload?: unknown;
}

interface TraceSummary {
  id: string;
  sessionId: string;
  userId: string;
  question: string;
  answer?: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED';
  routeType?: string | null;
  model?: string | null;
  toolNames: string[];
  summary?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
}

interface TraceDetail extends TraceSummary {
  events: TraceEvent[];
  graph: {
    nodes: TraceNode[];
    edges: TraceEdge[];
  };
}

type TraceView = 'overview' | 'graph' | 'events';
type EventFilter = 'all' | 'decision' | 'vector' | 'graph' | 'answer';

function statusMap(status: TraceSummary['status']): PipelineStatus {
  if (status === 'SUCCESS') return 'success';
  if (status === 'RUNNING') return 'running';
  if (status === 'FAILED' || status === 'ABORTED') return 'failed';
  return 'pending';
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parseServerDate(value));
}

function formatEventTime(value: string) {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(value: number) {
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.floor((value / 1000) % 60)}s`;
}

const EVENT_COLORS: Record<string, string> = {
  decision: '#c98f2b',
  vector_search: '#6b8fb2',
  graph_walk: '#a67cc2',
  context: '#4a7c59',
  session: '#2d6a5f',
  answer: '#2d6a5f',
  error: '#b54b3a',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  decision: '판단',
  vector_search: '벡터',
  graph_walk: '그래프',
  context: '컨텍스트',
  session: '세션',
  answer: '답변',
  error: '오류',
};

export default function AdminTracesPage() {
  const router = useRouter();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const userRole = useUserStore((s) => s.userRole);
  const accessToken = useUserStore((s) => s.accessToken);

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [view, setView] = useState<TraceView>('overview');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (userRole && userRole !== 'ADMIN') {
      router.replace('/chat');
    }
  }, [hasHydrated, accessToken, userRole, router]);

  const fetchTraces = useCallback(async () => {
    const list = await api<TraceSummary[]>('/admin/traces?limit=30');
    startTransition(() => setTraces(list));
    return list;
  }, []);

  const fetchDetail = useCallback(async (traceId: string) => {
    const detail = await api<TraceDetail>(`/admin/traces/${traceId}`);
    startTransition(() => setSelectedTrace(detail));
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!hasHydrated || !accessToken) return;

    (async () => {
      try {
        const list = await fetchTraces();
        if (!mounted) return;
        const firstId = list[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          await fetchDetail(firstId);
        }
        setError(null);
      } catch {
        if (mounted) setError('AI 추적 로그를 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const timer = window.setInterval(() => {
      void fetchTraces().catch(() => undefined);
    }, 15_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [hasHydrated, accessToken, fetchDetail, fetchTraces]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchDetail(selectedId).catch(() => undefined);
  }, [fetchDetail, selectedId]);

  useEffect(() => {
    setView('overview');
    setEventFilter('all');
  }, [selectedId]);

  const decisionEvents = useMemo(
    () => selectedTrace?.events.filter((e) => e.type === 'decision') ?? [],
    [selectedTrace],
  );
  const vectorEvents = useMemo(
    () => selectedTrace?.events.filter((e) => e.type === 'vector_search') ?? [],
    [selectedTrace],
  );
  const graphEvents = useMemo(
    () => selectedTrace?.events.filter((e) => e.type === 'graph_walk') ?? [],
    [selectedTrace],
  );

  const filteredEvents = useMemo(() => {
    if (!selectedTrace) return [];
    if (eventFilter === 'all') return selectedTrace.events;
    if (eventFilter === 'decision')
      return selectedTrace.events.filter((e) => e.type === 'decision');
    if (eventFilter === 'vector')
      return selectedTrace.events.filter((e) => e.type === 'vector_search');
    if (eventFilter === 'graph')
      return selectedTrace.events.filter((e) => e.type === 'graph_walk');
    if (eventFilter === 'answer')
      return selectedTrace.events.filter((e) => e.type === 'answer' || e.type === 'error');
    return selectedTrace.events;
  }, [selectedTrace, eventFilter]);

  const filteredTraces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return traces;
    return traces.filter((t) => t.question.toLowerCase().includes(q));
  }, [traces, query]);

  return (
    <div
      className="admin-page-responsive"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
      }}
    >
      <AdminSidebar active="trace" />

      <main
        className="admin-main-responsive"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <AdminTopbar
          title="AI 추적"
          subtitle="질문별 판단 근거와 도구 호출 흐름을 확인합니다."
        />

        {error && (
          <div
            style={{
              padding: '12px 28px',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              fontSize: 13,
              borderBottom: '1px solid rgba(181,75,58,0.2)',
            }}
          >
            {error}
          </div>
        )}

        <div
          className="trace-layout-responsive"
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
          }}
        >
          <aside
            className="trace-sidebar-responsive"
            style={{
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    margin: 0,
                    letterSpacing: '-0.01em',
                  }}
                >
                  최근 trace
                </h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {traces.length}개
                </span>
              </div>
              <div style={{ position: 'relative', marginTop: 10 }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute',
                    left: 9,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  className="input"
                  placeholder="질문 검색..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
                />
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
                display: 'grid',
                gap: 4,
                alignContent: 'start',
              }}
            >
              {loading && traces.length === 0 && (
                <div
                  style={{
                    padding: '40px 12px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  불러오는 중...
                </div>
              )}
              {!loading && filteredTraces.length === 0 && (
                <div
                  style={{
                    padding: '40px 12px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  {query ? '검색 결과 없음' : '저장된 trace가 없습니다.'}
                </div>
              )}
              {filteredTraces.map((t) => (
                <TraceListItem
                  key={t.id}
                  trace={t}
                  selected={selectedId === t.id}
                  onClick={() => setSelectedId(t.id)}
                />
              ))}
            </div>
          </aside>

          {view === 'events' ? (
            <EventsView
              trace={selectedTrace}
              events={filteredEvents}
              eventFilter={eventFilter}
              setEventFilter={setEventFilter}
              view={view}
              setView={setView}
              decisionCount={decisionEvents.length}
              vectorCount={vectorEvents.length}
              graphCount={graphEvents.length}
            />
          ) : (
            <section
              className="trace-content-responsive"
              style={{
                overflowY: 'auto',
                padding: '22px 26px 28px',
                display: 'grid',
                gap: 16,
                background: 'var(--bg-canvas)',
                alignContent: 'start',
              }}
            >
              {!selectedTrace && (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 20,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  {loading ? '불러오는 중...' : '선택된 trace가 없습니다.'}
                </div>
              )}

              {selectedTrace && (
                <>
                  <TraceHeader
                    trace={selectedTrace}
                    view={view}
                    setView={setView}
                    decisionCount={decisionEvents.length}
                    vectorCount={vectorEvents.length}
                    graphCount={graphEvents.length}
                    withMetrics={view === 'overview'}
                  />

                  {view === 'overview' && (
                    <>
                      <div
                        className="trace-overview-split-responsive"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.4fr 1fr',
                          gap: 14,
                        }}
                      >
                        <Panel label="최종 답변">
                          <div
                            className="prose-chat"
                            style={{
                              fontSize: 14,
                              lineHeight: 1.75,
                              color: 'var(--text-primary)',
                            }}
                          >
                            <MarkdownMessage
                              content={selectedTrace.answer ?? '저장된 답변이 없습니다.'}
                            />
                          </div>
                        </Panel>

                        <div style={{ display: 'grid', gap: 12 }}>
                          <Panel label="사용한 도구">
                            {selectedTrace.toolNames.length === 0 ? (
                              <p
                                style={{
                                  fontSize: 13,
                                  color: 'var(--text-secondary)',
                                  margin: 0,
                                }}
                              >
                                기록된 도구가 없습니다.
                              </p>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 6,
                                }}
                              >
                                {selectedTrace.toolNames.map((t) => (
                                  <span
                                    key={t}
                                    style={{
                                      fontSize: 12,
                                      fontFamily: 'ui-monospace, monospace',
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      background: 'var(--bg-subtle)',
                                      border: '1px solid var(--border)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </Panel>

                          <Panel label="모델 정보">
                            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                              <RowKV k="Route" v={selectedTrace.routeType ?? '-'} />
                              <RowKV k="Model" v={selectedTrace.model ?? '-'} />
                              <RowKV
                                k="Duration"
                                v={
                                  selectedTrace.durationMs
                                    ? formatDuration(selectedTrace.durationMs)
                                    : '-'
                                }
                              />
                              <RowKV
                                k="Run ID"
                                v={`${selectedTrace.id.slice(0, 8)}...`}
                              />
                            </div>
                          </Panel>

                          {selectedTrace.error && (
                            <div
                              style={{
                                padding: 12,
                                borderRadius: 12,
                                background: 'var(--danger-soft)',
                                color: 'var(--danger)',
                                fontSize: 12,
                                lineHeight: 1.5,
                                border: '1px solid rgba(181,75,58,0.18)',
                              }}
                            >
                              {selectedTrace.error}
                            </div>
                          )}
                        </div>
                      </div>

                      <Panel
                        label="판단 단계 요약"
                        sub={`${selectedTrace.events.length}개 이벤트 · 자세한 내역은 이벤트 타임라인 탭`}
                        action={
                          <button
                            className="btn-ghost"
                            onClick={() => setView('events')}
                          >
                            전체 이벤트 보기
                          </button>
                        }
                      >
                        <div style={{ display: 'grid', gap: 10 }}>
                          {selectedTrace.events.slice(0, 6).map((e, i, arr) => (
                            <TimelineStep
                              key={e.id}
                              time={formatEventTime(e.at)}
                              type={e.type}
                              title={e.title}
                              detail={e.detail}
                              last={i === arr.length - 1}
                            />
                          ))}
                          {selectedTrace.events.length === 0 && (
                            <p
                              style={{
                                fontSize: 13,
                                color: 'var(--text-muted)',
                                margin: 0,
                              }}
                            >
                              기록된 이벤트가 없습니다.
                            </p>
                          )}
                        </div>
                      </Panel>
                    </>
                  )}

                  {view === 'graph' && (
                    <Panel
                      label="그래프 탐색 시각화"
                      sub="질문 → 라우팅 → 도구 → 검색 결과 → 그래프 확장"
                    >
                      <div
                        style={{
                          minHeight: 460,
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-subtle)',
                        }}
                      >
                        <AdminTraceGraph
                          graph={selectedTrace.graph}
                          routeType={selectedTrace.routeType}
                          toolNames={selectedTrace.toolNames}
                        />
                      </div>
                    </Panel>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function TraceListItem({
  trace,
  selected,
  onClick,
}: {
  trace: TraceSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        background: selected ? 'var(--bg-surface)' : 'transparent',
        border: selected
          ? '1px solid var(--border-strong)'
          : '1px solid transparent',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
        fontFamily: 'var(--font)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <StatusPill status={statusMap(trace.status)} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {formatRelativeKoreanTime(trace.startedAt)}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: selected ? 500 : 400,
          lineHeight: 1.5,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {trace.question}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {trace.routeType && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'var(--accent-soft)',
              color: 'var(--accent-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {trace.routeType}
          </span>
        )}
        {trace.toolNames.slice(0, 2).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}

function TraceHeader({
  trace,
  view,
  setView,
  decisionCount,
  vectorCount,
  graphCount,
  withMetrics,
}: {
  trace: TraceDetail;
  view: TraceView;
  setView: (v: TraceView) => void;
  decisionCount: number;
  vectorCount: number;
  graphCount: number;
  withMetrics: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <StatusPill status={statusMap(trace.status)} />
        {trace.routeType && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--accent-soft)',
              color: 'var(--accent-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {trace.routeType}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatTimestamp(trace.startedAt)}
          {trace.durationMs ? ` · ${formatDuration(trace.durationMs)}` : ''}
        </span>
      </div>

      <h2
        style={{
          fontSize: withMetrics ? 22 : 18,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.35,
          margin: 0,
          color: 'var(--text-primary)',
        }}
      >
        {trace.question}
      </h2>

      {withMetrics && trace.summary && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            margin: '12px 0 0',
            maxWidth: 760,
          }}
        >
          {trace.summary}
        </p>
      )}

      <div
        className="trace-tabs-responsive"
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 18,
          borderBottom: '1px solid var(--border)',
          marginLeft: -20,
          marginRight: -20,
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        <Tab
          icon={<FileText size={13} />}
          label="개요"
          active={view === 'overview'}
          onClick={() => setView('overview')}
        />
        <Tab
          icon={<Workflow size={13} />}
          label="그래프"
          active={view === 'graph'}
          onClick={() => setView('graph')}
        />
        <Tab
          icon={<Activity size={13} />}
          label="이벤트 타임라인"
          active={view === 'events'}
          onClick={() => setView('events')}
        />
      </div>

      {withMetrics && (
        <div
          className="trace-mini-stats-responsive"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginTop: 18,
          }}
        >
          <MiniStat
            icon={<Bot size={14} />}
            label="도구"
            value={String(trace.toolNames.length)}
            sub={trace.toolNames.slice(0, 2).join(' + ') || '-'}
          />
          <MiniStat
            icon={<Search size={14} />}
            label="벡터 단계"
            value={String(vectorCount)}
            sub="retrieval"
          />
          <MiniStat
            icon={<Network size={14} />}
            label="그래프 단계"
            value={String(graphCount)}
            sub={`${trace.graph.nodes.length} 노드`}
          />
          <MiniStat
            icon={<Clock size={14} />}
            label="판단 단계"
            value={String(decisionCount)}
            sub="decision"
          />
        </div>
      )}
    </div>
  );
}

function Tab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active
          ? '2px solid var(--accent)'
          : '2px solid transparent',
        marginBottom: -1,
        fontFamily: 'var(--font)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-muted)',
        }}
      >
        {icon}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function Panel({
  label,
  sub,
  action,
  children,
}: {
  label: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </div>
          {sub && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                margin: '3px 0 0',
              }}
            >
              {sub}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span
        style={{
          color: 'var(--text-primary)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
        }}
      >
        {v}
      </span>
    </div>
  );
}

function TimelineStep({
  time,
  type,
  title,
  detail,
  last,
}: {
  time: string;
  type: string;
  title: string;
  detail?: string | null;
  last?: boolean;
}) {
  const color = EVENT_COLORS[type] ?? 'var(--accent)';
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: 'var(--accent-soft)',
            color: 'var(--accent-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
        </div>
        {!last && (
          <div
            style={{
              position: 'absolute',
              left: 11,
              top: 26,
              bottom: -14,
              width: 1,
              background: 'var(--border)',
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, paddingBottom: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {time}
          </span>
        </div>
        {detail && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 3,
              lineHeight: 1.6,
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function EventsView({
  trace,
  events,
  eventFilter,
  setEventFilter,
  view,
  setView,
  decisionCount,
  vectorCount,
  graphCount,
}: {
  trace: TraceDetail | null;
  events: TraceEvent[];
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  view: TraceView;
  setView: (v: TraceView) => void;
  decisionCount: number;
  vectorCount: number;
  graphCount: number;
}) {
  return (
    <section
      className="trace-content-responsive"
      style={{
        overflowY: 'auto',
        padding: '22px 26px 28px',
        display: 'grid',
        gap: 16,
        background: 'var(--bg-canvas)',
        alignContent: 'start',
      }}
    >
      {!trace && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          선택된 trace가 없습니다.
        </div>
      )}
      {trace && (
        <>
          <TraceHeader
            trace={trace}
            view={view}
            setView={setView}
            decisionCount={decisionCount}
            vectorCount={vectorCount}
            graphCount={graphCount}
            withMetrics={false}
          />

          <Panel
            label="이벤트 타임라인"
            sub={`${events.length}개 이벤트 · 원본 payload 확장 가능`}
            action={
              <div style={{ display: 'flex', gap: 6 }}>
                {(
                  [
                    { k: 'all' as EventFilter, l: '전체' },
                    { k: 'decision' as EventFilter, l: '판단' },
                    { k: 'vector' as EventFilter, l: '벡터' },
                    { k: 'graph' as EventFilter, l: '그래프' },
                    { k: 'answer' as EventFilter, l: '답변' },
                  ]
                ).map(({ k, l }) => {
                  const active = eventFilter === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setEventFilter(k)}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '5px 10px',
                        borderRadius: 999,
                        background: active ? 'var(--accent)' : 'var(--bg-surface)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        cursor: 'pointer',
                        letterSpacing: '-0.01em',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            }
          >
            <div style={{ display: 'grid', gap: 0 }}>
              {events.length === 0 && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    margin: 0,
                    padding: '16px 0',
                  }}
                >
                  해당 필터에 속하는 이벤트가 없습니다.
                </p>
              )}
              {events.map((e, i) => (
                <EventRow
                  key={e.id}
                  time={formatEventTime(e.at)}
                  type={e.type}
                  title={e.title}
                  detail={e.detail}
                  payload={e.payload}
                  last={i === events.length - 1}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function EventRow({
  time,
  type,
  title,
  detail,
  payload,
  last,
}: {
  time: string;
  type: string;
  title: string;
  detail?: string | null;
  payload?: unknown;
  last?: boolean;
}) {
  const color = EVENT_COLORS[type] ?? 'var(--accent)';
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 0',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 80,
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'ui-monospace, monospace',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {time}
      </div>
      <div style={{ flexShrink: 0, position: 'relative', width: 10 }}>
        <span
          style={{
            display: 'block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
            marginTop: 6,
          }}
        />
        {!last && (
          <span
            style={{
              position: 'absolute',
              left: 3.5,
              top: 18,
              bottom: -14,
              width: 1,
              background: 'var(--border)',
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {EVENT_TYPE_LABEL[type] ?? type}
          </span>
        </div>
        {detail && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 3,
              lineHeight: 1.6,
            }}
          >
            {detail}
          </div>
        )}
        {payload != null && (
          <details
            style={{
              marginTop: 6,
              padding: '4px 8px',
              fontSize: 11,
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ChevronDown size={11} /> Raw Payload
            </summary>
            <pre
              style={{
                marginTop: 6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
