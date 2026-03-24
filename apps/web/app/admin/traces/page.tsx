'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Bot, Clock3, Network, Search, Workflow, FileText, ListTree } from 'lucide-react';
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

type TraceView = 'overview' | 'graph' | 'events';

export default function AdminTracesPage() {
  const router = useRouter();
  const hasHydrated = useUserStore((state) => state._hasHydrated);
  const userRole = useUserStore((state) => state.userRole);
  const accessToken = useUserStore((state) => state.accessToken);

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [activeView, setActiveView] = useState<TraceView>('overview');
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
  }, [hasHydrated, accessToken, fetchDetail, fetchTraces]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchDetail(selectedId).catch(() => undefined);
  }, [fetchDetail, selectedId]);

  useEffect(() => {
    setActiveView('overview');
  }, [selectedId]);

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

  if (!hasHydrated) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="surface rounded-[28px] px-6 py-5 text-sm text-[var(--text-secondary)]">
          로그인 상태를 확인하는 중입니다.
        </div>
      </div>
    );
  }

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
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <section className="surface rounded-[30px] px-6 py-5">
          <AdminConsoleNav />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <span className="section-kicker">AI Trace Console</span>
              <h1 className="display-text mt-4 text-3xl font-semibold text-[var(--text-primary)] md:text-[2.65rem]">
                질문의 판단 근거를
                <br />
                관심사별로 나눠서 확인
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                같은 trace라도 개요, 그래프, 이벤트를 분리해서 필요한 정보만 볼 수 있습니다.
              </p>
            </div>

            <div className="grid min-w-[280px] gap-3 sm:grid-cols-3">
              <OverviewStat
                icon={Activity}
                label="최근 trace"
                value={traces.length.toString()}
                caption="최근 30개 기준"
              />
              <OverviewStat
                icon={Bot}
                label="활성 route"
                value={selectedTrace?.routeType ?? '-'}
                caption={selectedTrace?.status ?? '선택 없음'}
              />
              <OverviewStat
                icon={Clock3}
                label="최근 갱신"
                value={traces[0] ? formatRelativeKoreanTime(traces[0].startedAt) : '-'}
                caption="자동 새로고침"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="surface self-start rounded-[28px] p-4 xl:sticky xl:top-6">
            <div className="px-2 pb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">최근 trace</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                질문 단위로 저장된 실행 로그입니다.
              </p>
            </div>

            <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
              {traces.length === 0 ? (
                <div className="surface-soft rounded-[22px] px-4 py-5 text-sm text-[var(--text-secondary)]">
                  아직 저장된 AI 추적 로그가 없습니다.
                </div>
              ) : (
                traces.map((trace) => (
                  <button
                    key={trace.id}
                    type="button"
                    onClick={() => setSelectedId(trace.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      selectedId === trace.id
                        ? 'border-[rgba(47,111,91,0.2)] bg-[var(--brand-soft)] shadow-[0_14px_30px_rgba(20,31,45,0.08)]'
                        : 'border-[var(--panel-border)] bg-white/70 hover:bg-white/86'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <StatusBadge status={trace.status} />
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatRelativeKoreanTime(trace.startedAt)}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">
                      {trace.question}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {trace.routeType ? (
                        <span className="badge-soft !px-2.5 !py-1 !text-[11px] uppercase">
                          {trace.routeType}
                        </span>
                      ) : null}
                      {trace.toolNames.slice(0, 2).map((toolName) => (
                        <span key={toolName} className="badge-soft !px-2.5 !py-1 !text-[11px]">
                          {toolName}
                        </span>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="space-y-5">
            {selectedTrace ? (
              <>
                <section className="surface rounded-[28px] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={selectedTrace.status} />
                        {selectedTrace.routeType ? (
                          <span className="badge-soft !px-2.5 !py-1 !text-[11px] uppercase">
                            {selectedTrace.routeType}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatTimestamp(selectedTrace.startedAt)}
                          {selectedTrace.durationMs
                            ? ` · ${formatDuration(selectedTrace.durationMs)}`
                            : ''}
                        </span>
                      </div>

                      <h2 className="mt-4 text-2xl font-semibold leading-[1.3] text-[var(--text-primary)] md:text-[2rem]">
                        {selectedTrace.question}
                      </h2>

                      <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
                        {selectedTrace.summary ?? '요약 정보가 아직 없습니다.'}
                      </p>
                    </div>

                    <div className="grid min-w-[260px] gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <DetailStat
                        icon={Bot}
                        label="도구"
                        value={selectedTrace.toolNames.length.toString()}
                        caption={selectedTrace.model ?? '모델 정보 없음'}
                      />
                      <DetailStat
                        icon={Search}
                        label="벡터 단계"
                        value={vectorEvents.length.toString()}
                        caption="retrieval"
                      />
                      <DetailStat
                        icon={Network}
                        label="그래프 단계"
                        value={graphEvents.length.toString()}
                        caption={`${selectedTrace.graph.nodes.length} 노드`}
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <TraceViewButton
                      icon={FileText}
                      label="개요"
                      active={activeView === 'overview'}
                      onClick={() => setActiveView('overview')}
                    />
                    <TraceViewButton
                      icon={Workflow}
                      label="그래프"
                      active={activeView === 'graph'}
                      onClick={() => setActiveView('graph')}
                    />
                    <TraceViewButton
                      icon={ListTree}
                      label="이벤트"
                      active={activeView === 'events'}
                      onClick={() => setActiveView('events')}
                    />
                  </div>

                  {activeView === 'overview' ? (
                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.85fr)]">
                      <div className="surface-soft rounded-[24px] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          최종 답변
                        </p>
                        <div className="prose-chat mt-3 text-sm leading-7 text-[var(--text-primary)]">
                          <MarkdownMessage content={selectedTrace.answer ?? '저장된 답변이 없습니다.'} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="surface-soft rounded-[24px] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            사용한 도구
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedTrace.toolNames.length > 0 ? (
                              selectedTrace.toolNames.map((toolName) => (
                                <span key={toolName} className="badge-soft">
                                  {toolName}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-[var(--text-secondary)]">기록된 도구가 없습니다.</span>
                            )}
                          </div>
                        </div>

                        <div className="surface-soft rounded-[24px] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            핵심 단계 요약
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <MiniMetric label="판단" value={`${decisionEvents.length}`} />
                            <MiniMetric label="벡터" value={`${vectorEvents.length}`} />
                            <MiniMetric label="그래프" value={`${graphEvents.length}`} />
                          </div>
                        </div>

                        {selectedTrace.error ? (
                          <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                            {selectedTrace.error}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                {activeView === 'graph' ? (
                  <section className="surface rounded-[28px] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                          그래프 탐색 시각화
                        </h2>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          질문, 라우팅, 도구, 검색 결과, 그래프 확장 흐름만 집중해서 봅니다.
                        </p>
                      </div>
                    </div>
                    <AdminTraceGraph
                      graph={selectedTrace.graph}
                      routeType={selectedTrace.routeType}
                      toolNames={selectedTrace.toolNames}
                    />
                  </section>
                ) : null}

                {activeView === 'events' ? (
                  <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <section className="surface rounded-[28px] p-5">
                      <div className="flex items-center gap-2">
                        <Activity size={16} className="text-[var(--brand-strong)]" />
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">판단 단계</h2>
                      </div>
                      <div className="mt-5 space-y-5">
                        <TraceSection title="도구 선택" items={decisionEvents} />
                        <TraceSection title="벡터 검색" items={vectorEvents} />
                        <TraceSection title="그래프 확장" items={graphEvents} />
                      </div>
                    </section>

                    <section className="surface rounded-[28px] p-5">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">이벤트 타임라인</h2>
                      <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                        {selectedTrace.events.map((event) => (
                          <div
                            key={event.id}
                            className="rounded-[22px] border border-[var(--panel-border)] bg-white/70 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  {event.title}
                                </p>
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
                  </div>
                ) : null}
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

function TraceViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--brand-strong)] text-white shadow-[0_12px_24px_rgba(47,111,91,0.18)]'
          : 'border border-[var(--panel-border)] bg-white/76 text-[var(--text-secondary)] hover:bg-white hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--panel-border)] bg-white/76 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
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

function OverviewStat({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[22px] border border-[var(--panel-border)] bg-white/72 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">{caption}</p>
    </div>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[22px] border border-[var(--panel-border)] bg-white/72 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--text-muted)]">{caption}</p>
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
