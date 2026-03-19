'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Bot, Network, Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { parseServerDate, formatRelativeKoreanTime } from '../../../lib/datetime';
import { useUserStore } from '../../../store/user.store';
import { MarkdownMessage } from '../../../components/markdown';
import { AdminConsoleNav } from '../../../components/admin-console-nav';
import { AdminTraceGraph } from '../../../components/admin-trace-graph';

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
  type: 'session' | 'context' | 'decision' | 'vector_search' | 'graph_walk' | 'answer' | 'error';
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

export default function AdminTracesPage() {
  const router = useRouter();
  const userRole = useUserStore((state) => state.userRole);
  const accessToken = useUserStore((state) => state.accessToken);

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (userRole && userRole !== 'ADMIN') {
      router.replace('/chat');
    }
  }, [accessToken, userRole, router]);

  const fetchTraces = useCallback(async () => {
    const list = await api<TraceSummary[]>('/admin/traces?limit=30');
    startTransition(() => {
      setTraces(list);
    });
    return list;
  }, []);

  const fetchDetail = useCallback(async (traceId: string) => {
    const detail = await api<TraceDetail>(`/admin/traces/${traceId}`);
    startTransition(() => {
      setSelectedTrace(detail);
    });
  }, []);

  useEffect(() => {
    let mounted = true;

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
        if (mounted) {
          setError('AI 추적 로그를 불러오지 못했습니다.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const timer = window.setInterval(() => {
      void fetchTraces().catch(() => undefined);
    }, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [fetchDetail, fetchTraces]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchDetail(selectedId).catch(() => undefined);
  }, [fetchDetail, selectedId]);

  const decisionEvents = useMemo(
    () => selectedTrace?.events.filter((event) => event.type === 'decision') ?? [],
    [selectedTrace],
  );
  const vectorEvents = useMemo(
    () => selectedTrace?.events.filter((event) => event.type === 'vector_search') ?? [],
    [selectedTrace],
  );
  const graphEvents = useMemo(
    () => selectedTrace?.events.filter((event) => event.type === 'graph_walk') ?? [],
    [selectedTrace],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="surface rounded-[28px] px-6 py-5 text-sm text-[var(--text-secondary)]">
          AI 추적 로그를 불러오는 중입니다.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="surface rounded-[28px] border border-rose-300 px-6 py-5 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="surface hero-grid rounded-[32px] px-7 py-8 md:px-8">
          <div className="flex flex-col gap-7">
            <AdminConsoleNav />
            <div className="max-w-3xl">
              <span className="section-kicker">AI Trace Console</span>
              <h1 className="display-text mt-5 text-4xl font-semibold text-[var(--text-primary)]">
                질문별 검색 경로와
                <br />
                그래프 탐색 흐름 추적
              </h1>
              <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                도구 선택, 벡터 검색 결과, 그래프 노드 확장, 최종 답변 근거를 세션 단위로 확인합니다.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="surface rounded-[28px] p-4">
            <div className="flex items-center justify-between gap-3 px-2 pb-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  최근 추적 로그
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  질문 1회당 1개의 추적 로그입니다.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {traces.length === 0 ? (
                <div className="surface-soft rounded-[24px] px-4 py-5 text-sm text-[var(--text-secondary)]">
                  아직 저장된 AI 추적 로그가 없습니다.
                </div>
              ) : (
                traces.map((trace) => (
                  <button
                    key={trace.id}
                    type="button"
                    onClick={() => setSelectedId(trace.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      selectedId === trace.id
                        ? 'border-[rgba(47,111,91,0.2)] bg-[var(--brand-soft)]'
                        : 'border-transparent bg-white/60 hover:border-[var(--panel-border)] hover:bg-white/84'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge status={trace.status} />
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatRelativeKoreanTime(trace.startedAt)}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">
                      {trace.question}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {trace.summary ?? '요약 정보 없음'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trace.toolNames.slice(0, 3).map((toolName) => (
                        <span key={toolName} className="badge-soft text-[11px]">
                          {toolName}
                        </span>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            {selectedTrace ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <TraceStatCard
                    icon={Bot}
                    title="선택된 도구"
                    value={selectedTrace.toolNames.length.toString()}
                    sub={selectedTrace.routeType ? `${selectedTrace.routeType} 경로` : '도구 선택 없음'}
                  />
                  <TraceStatCard
                    icon={Search}
                    title="벡터 검색 단계"
                    value={vectorEvents.length.toString()}
                    sub={selectedTrace.model ?? '모델 정보 없음'}
                  />
                  <TraceStatCard
                    icon={Network}
                    title="그래프 확장 단계"
                    value={graphEvents.length.toString()}
                    sub={`${selectedTrace.graph.nodes.length} 노드 · ${selectedTrace.graph.edges.length} 엣지`}
                  />
                </div>

                <div className="surface rounded-[28px] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={selectedTrace.status} />
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          {selectedTrace.routeType ?? 'UNSPECIFIED'}
                        </span>
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
                        {selectedTrace.question}
                      </h2>
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        {formatTimestamp(selectedTrace.startedAt)}
                        {selectedTrace.durationMs ? ` · ${formatDuration(selectedTrace.durationMs)}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedTrace.toolNames.map((toolName) => (
                        <span key={toolName} className="badge-soft">
                          {toolName}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="surface-soft rounded-[24px] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        요약
                      </p>
                      <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        {selectedTrace.summary ?? '요약 정보 없음'}
                      </p>
                      {selectedTrace.error ? (
                        <p className="mt-4 text-sm leading-7 text-rose-700">{selectedTrace.error}</p>
                      ) : null}
                    </div>

                    <div className="surface-soft rounded-[24px] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        최종 답변
                      </p>
                      <div className="mt-3 text-sm leading-7 text-[var(--text-primary)]">
                        <MarkdownMessage content={selectedTrace.answer ?? '저장된 답변이 없습니다.'} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <section className="surface rounded-[28px] p-6">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-[var(--brand-strong)]" />
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">판단 근거</h2>
                    </div>
                    <div className="mt-5 space-y-5">
                      <TraceSection title="도구 선택" items={decisionEvents} />
                      <TraceSection title="벡터 검색" items={vectorEvents} />
                      <TraceSection title="그래프 확장" items={graphEvents} />
                    </div>
                  </section>

                  <section className="surface rounded-[28px] p-6">
                    <div className="flex items-center gap-2">
                      <Network size={16} className="text-[var(--brand-strong)]" />
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">그래프 시각화</h2>
                    </div>
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      질문에서 라우트가 어떻게 잡혔고, 어떤 도구와 검색 결과를 거쳐 그래프 탐색으로
                      이어졌는지 단계별로 확인합니다. 노드를 클릭하면 들어온 경로와 다음 경로를
                      분리해서 볼 수 있습니다.
                    </p>
                    <div className="mt-5">
                      <AdminTraceGraph
                        graph={selectedTrace.graph}
                        routeType={selectedTrace.routeType}
                        toolNames={selectedTrace.toolNames}
                      />
                    </div>
                  </section>
                </div>

                <section className="surface rounded-[28px] p-6">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">이벤트 타임라인</h2>
                  <div className="mt-5 space-y-3">
                    {selectedTrace.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-[22px] border border-[var(--panel-border)] bg-white/70 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{event.title}</p>
                            {event.detail ? (
                              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                {event.detail}
                              </p>
                            ) : null}
                          </div>
                          <span className="text-xs text-[var(--text-muted)]">
                            {formatEventTime(event.at)}
                          </span>
                        </div>

                        {event.payload ? (
                          <details className="mt-4 rounded-[18px] bg-[rgba(19,32,51,0.04)] px-4 py-3">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                              Raw Payload
                            </summary>
                            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)]">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="surface rounded-[28px] px-6 py-10 text-sm text-[var(--text-secondary)]">
                선택된 추적 로그가 없습니다.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TraceSection({ title, items }: { title: string; items: TraceEvent[] }) {
  if (items.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">기록된 단계가 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</p>
      <div className="mt-3 space-y-3">
        {items.map((event) => (
          <div key={event.id} className="surface-soft rounded-[22px] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{event.title}</p>
              <span className="text-xs text-[var(--text-muted)]">{formatEventTime(event.at)}</span>
            </div>
            {event.detail ? (
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{event.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceStatCard({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: typeof Bot;
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="surface rounded-[28px] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-[var(--text-muted)]">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TraceSummary['status'] }) {
  const styles: Record<TraceSummary['status'], string> = {
    RUNNING: 'bg-amber-100 text-amber-700',
    SUCCESS: 'bg-emerald-100 text-emerald-700',
    FAILED: 'bg-rose-100 text-rose-700',
    ABORTED: 'bg-slate-200 text-slate-700',
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parseServerDate(value));
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(parseServerDate(value));
}

function formatDuration(value: number) {
  if (value < 1000) return `${value}ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.floor(value / 60000)}m ${(Math.floor(value / 1000) % 60).toString().padStart(2, '0')}s`;
}
