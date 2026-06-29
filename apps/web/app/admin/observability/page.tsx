'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { AdminSidebar, AdminTopbar } from '../../../components/layout/admin-sidebar';
import { AdminTraceGraph } from '../../../components/admin-trace-graph';
import { StatusPill, type PipelineStatus } from '../../../components/ui/status-pill';

type RagStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED';

interface TraceSummary {
  id: string;
  sessionId: string;
  userId: string;
  question: string;
  answer?: string | null;
  status: RagStatus;
  routeType?: string | null;
  model?: string | null;
  toolNames: string[];
  summary?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
}

interface TraceEvent {
  id: string;
  type: string;
  title: string;
  detail?: string | null;
  at: string;
  payload?: unknown;
}

interface TraceDetail extends TraceSummary {
  events: TraceEvent[];
  graph: { nodes: unknown[]; edges: unknown[] };
}

interface SearchResult {
  items: TraceSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface Stats {
  total: number;
  byStatus: { success: number; failed: number; aborted: number; running: number };
  errorRate: number;
  durationMs: { avg: number | null; p50: number | null; p95: number | null };
  byRoute: Array<{ route: string; count: number }>;
  hallucinationWarnings: number;
}

const PAGE_SIZE = 25;

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

function statusMap(status: RagStatus): PipelineStatus {
  if (status === 'SUCCESS') return 'success';
  if (status === 'RUNNING') return 'running';
  if (status === 'FAILED' || status === 'ABORTED') return 'failed';
  return 'pending';
}

function formatDuration(value?: number | null) {
  if (value == null) return '—';
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.floor((value / 1000) % 60)}s`;
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function ObservabilityPage() {
  const router = useRouter();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const userRole = useUserStore((s) => s.userRole);
  const accessToken = useUserStore((s) => s.accessToken);

  const [stats, setStats] = useState<Stats | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState('');
  const [routeType, setRouteType] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [q, setQ] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [offset, setOffset] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
    else if (userRole && userRole !== 'ADMIN') router.replace('/chat');
  }, [hasHydrated, accessToken, userRole, router]);

  const fetchStats = useCallback(async () => {
    const data = await api<Stats>('/admin/traces/stats');
    setStats(data);
  }, []);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (status) params.set('status', status);
      if (routeType) params.set('routeType', routeType);
      if (errorsOnly) params.set('errorsOnly', 'true');
      if (q) params.set('q', q);
      const data = await api<SearchResult>(`/admin/traces/search?${params.toString()}`);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [offset, status, routeType, errorsOnly, q]);

  useEffect(() => {
    if (!hasHydrated || !accessToken) return;
    void fetchStats().catch(() => undefined);
  }, [hasHydrated, accessToken, fetchStats]);

  useEffect(() => {
    if (!hasHydrated || !accessToken) return;
    void fetchRuns().catch(() => undefined);
  }, [hasHydrated, accessToken, fetchRuns]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void api<TraceDetail>(`/admin/traces/${selectedId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const applySearch = () => {
    setOffset(0);
    setQ(queryInput.trim());
  };

  const resetFilters = () => {
    setStatus('');
    setRouteType('');
    setErrorsOnly(false);
    setQueryInput('');
    setQ('');
    setOffset(0);
  };

  const total = result?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const routeOptions = useMemo(() => stats?.byRoute.map((r) => r.route) ?? [], [stats]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <AdminSidebar active="observability" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AdminTopbar
          title="옵저버빌리티"
          subtitle="RAG 에이전트 실행(run)을 가로질러 조회·분석합니다"
          actions={
            <button className="btn-secondary" onClick={() => { void fetchStats(); void fetchRuns(); }}>
              <RefreshCw size={14} /> 새로고침
            </button>
          }
        />

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          {/* 대시보드 카드 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <Stat label="전체 run" value={stats ? String(stats.total) : '—'} />
            <Stat
              label="에러율"
              value={stats ? `${(stats.errorRate * 100).toFixed(1)}%` : '—'}
              danger={!!stats && stats.errorRate > 0}
              sub={stats ? `실패 ${stats.byStatus.failed + stats.byStatus.aborted}` : undefined}
            />
            <Stat label="평균 지연" value={formatDuration(stats?.durationMs.avg)} />
            <Stat label="p50 / p95" value={`${formatDuration(stats?.durationMs.p50)} / ${formatDuration(stats?.durationMs.p95)}`} />
            <Stat
              label="환각 경고"
              value={stats ? String(stats.hallucinationWarnings) : '—'}
              danger={!!stats && stats.hallucinationWarnings > 0}
            />
          </div>

          {/* 필터 바 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }}
              />
              <input
                className="input"
                style={{ paddingLeft: 30, width: '100%' }}
                placeholder="질문·답변 검색"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              />
            </div>
            <select
              className="input"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
            >
              <option value="">모든 상태</option>
              <option value="SUCCESS">성공</option>
              <option value="FAILED">실패</option>
              <option value="ABORTED">중단</option>
              <option value="RUNNING">실행 중</option>
            </select>
            <select
              className="input"
              value={routeType}
              onChange={(e) => { setRouteType(e.target.value); setOffset(0); }}
            >
              <option value="">모든 라우트</option>
              {routeOptions.filter((r) => r !== '(none)').map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              className={errorsOnly ? 'btn-primary' : 'btn-secondary'}
              onClick={() => { setErrorsOnly((v) => !v); setOffset(0); }}
            >
              <AlertTriangle size={14} /> 에러만
            </button>
            <button className="btn-primary" onClick={applySearch}>검색</button>
            <button className="btn-ghost" onClick={resetFilters}>초기화</button>
          </div>

          {/* runs 테이블 */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--bg-surface)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <Th>시각</Th>
                  <Th>질문</Th>
                  <Th>상태</Th>
                  <Th>라우트</Th>
                  <Th>모델</Th>
                  <Th>지연</Th>
                  <Th>도구</Th>
                </tr>
              </thead>
              <tbody>
                {result?.items.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedId(run.id)}
                    style={{
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedId === run.id ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <Td muted nowrap>{formatTime(run.startedAt)}</Td>
                    <Td>
                      <div style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.question}
                      </div>
                    </Td>
                    <Td><StatusPill status={statusMap(run.status)} /></Td>
                    <Td muted nowrap>{run.routeType ?? '—'}</Td>
                    <Td muted nowrap>{run.model ?? '—'}</Td>
                    <Td muted nowrap>{formatDuration(run.durationMs)}</Td>
                    <Td muted nowrap>{run.toolNames?.length ?? 0}</Td>
                  </tr>
                ))}
                {!loading && (result?.items.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '28px 12px', color: 'var(--text-muted)' }}>
                      조건에 맞는 run이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {loading ? '불러오는 중…' : `총 ${total}건 · ${page}/${pageCount} 페이지`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                이전
              </button>
              <button
                className="btn-secondary"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 상세 드로어 */}
      {selectedId && (
        <RunDrawer
          loading={detailLoading}
          detail={detail}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function RunDrawer({
  loading,
  detail,
  onClose,
}: {
  loading: boolean;
  detail: TraceDetail | null;
  onClose: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 40 }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(560px, 92vw)',
          background: 'var(--bg-canvas)',
          borderLeft: '1px solid var(--border)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <strong style={{ fontSize: 15 }}>Run 상세</strong>
          <button className="btn-ghost" style={{ padding: 6 }} onClick={onClose} aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>불러오는 중…</p>}
          {!loading && detail && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <StatusPill status={statusMap(detail.status)} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {detail.routeType ?? '—'} · {detail.model ?? '—'} · {formatDuration(detail.durationMs)}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {detail.question}
                </div>
              </div>

              {detail.error && (
                <div
                  style={{
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    border: '1px solid var(--danger)',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12,
                    marginBottom: 14,
                  }}
                >
                  {detail.error}
                </div>
              )}

              {detail.graph?.nodes?.length > 0 && (
                <Section title="그래프">
                  <div style={{ height: 260, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <AdminTraceGraph
                      graph={detail.graph as never}
                      routeType={detail.routeType}
                      toolNames={detail.toolNames}
                    />
                  </div>
                </Section>
              )}

              <Section title={`이벤트 타임라인 (${detail.events.length})`}>
                <div style={{ display: 'grid', gap: 6 }}>
                  {detail.events.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: EVENT_COLORS[ev.type] ?? 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: EVENT_COLORS[ev.type] ?? 'var(--text-muted)' }}>
                          {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{ev.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatTime(ev.at).split(' ').pop()}
                        </span>
                      </div>
                      {ev.detail && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, paddingLeft: 15 }}>
                          {ev.detail}
                        </div>
                      )}
                      {ev.payload != null && (
                        <details style={{ marginTop: 4, paddingLeft: 15 }}>
                          <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            payload
                          </summary>
                          <pre
                            style={{
                              fontSize: 11,
                              background: 'var(--bg-subtle)',
                              padding: 8,
                              borderRadius: 6,
                              overflow: 'auto',
                              maxHeight: 220,
                              marginTop: 4,
                            }}
                          >
                            {JSON.stringify(ev.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {detail.answer && (
                <Section title="답변">
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    {detail.answer}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--bg-surface)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 600 }}>{children}</th>;
}

function Td({
  children,
  muted,
  nowrap,
}: {
  children: React.ReactNode;
  muted?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      style={{
        padding: '9px 12px',
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
        whiteSpace: nowrap ? 'nowrap' : 'normal',
      }}
    >
      {children}
    </td>
  );
}
