'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Database, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useUserStore } from '../../store/user.store';
import { AdminConsoleNav } from '../../components/admin-console-nav';

interface QdrantStats {
  collection: string;
  pointsCount: number;
  indexedVectorsCount: number;
  vectorSize: number;
  status: string;
}

interface Neo4jStats {
  nodes: Record<string, number>;
  relationships: number;
}

interface SyncStatus {
  isSyncing: boolean;
  currentRunId: string | null;
  lastSyncAt: string | null;
  lastResult: { success: boolean; message: string } | null;
}

interface Stats {
  qdrant: QdrantStats;
  neo4j: Neo4jStats;
  sync: SyncStatus;
}

interface SyncSourceStatus {
  id: string;
  runId: string;
  seedKey: string;
  seedName: string;
  script: string;
  trigger: 'MANUAL' | 'CRON' | 'SEED';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  phase: string | null;
  vectorCount: number | null;
  graphCount: number | null;
  skippedCount: number | null;
}

interface SyncLog {
  id: string;
  runId: string;
  seedKey: string;
  seedName: string;
  script: string;
  trigger: 'MANUAL' | 'CRON' | 'SEED';
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  vectorCount: number | null;
  graphCount: number | null;
  skippedCount: number | null;
  phase: string | null;
  itemTotal: number | null;
  fetchCurrent: number | null;
  fetchTotal: number | null;
  processCurrent: number | null;
  processTotal: number | null;
  vectorCurrent: number | null;
  vectorTotal: number | null;
  graphCurrent: number | null;
  graphTotal: number | null;
  summary: string | null;
  stdout: string | null;
  stderr: string | null;
}

interface SyncStartResult {
  success: boolean;
  message: string;
  runId: string | null;
}

interface SyncSeedProgress extends SyncLog {
  progressPercent: number;
  progressLabel: string;
}

interface SyncRunProgress {
  runId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  isActive: boolean;
  startedAt: string;
  finishedAt: string | null;
  totalSeeds: number;
  completedSeeds: number;
  progressPercent: number;
  seeds: SyncSeedProgress[];
}

const NODE_LABELS: Record<string, string> = {
  Policy: '중앙/지자체 복지정책',
  WelfareFacility: '사회복지시설',
  HousingComplex: '공공임대단지',
  HousingAnnouncement: '모집공고',
  LifeStage: '생애주기',
  Theme: '정책주제',
  TargetGroup: '대상자',
  Region: '지역',
  FacilityKind: '시설종류',
  Institution: '공급기관',
};

const SOURCE_ORDER = [
  'welfare',
  'local-welfare',
  'youth-policy',
  'rental-housing',
  'facility',
  'housing-announcement',
  'applyhome',
  'applyhome-cmpet',
  'applyhome-stat',
];

export default function AdminPage() {
  const router = useRouter();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const userRole = useUserStore((s) => s.userRole);
  const accessToken = useUserStore((s) => s.accessToken);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SyncSourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncRunId, setSyncRunId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncRunProgress | null>(null);
  const [syncProgressLoading, setSyncProgressLoading] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

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

  const fetchStats = useCallback(async () => {
    try {
      const [statsData, logData, sourceData] = await Promise.all([
        api<Stats>('/admin/stats'),
        api<SyncLog[]>('/admin/sync/logs?limit=20'),
        api<SyncSourceStatus[]>('/admin/sync/sources/status'),
      ]);
      setStats(statsData);
      setLogs(logData);
      setSourceStatuses(sourceData);
      setError(null);
    } catch {
      setError('통계 조회에 실패했습니다. 로그인 상태와 관리자 권한을 확인하세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSyncProgress = useCallback(async (runId: string) => {
    setSyncProgressLoading(true);
    try {
      const progress = await api<SyncRunProgress | null>(`/admin/sync/runs/${runId}`);
      if (progress) {
        setSyncProgress(progress);
        setSyncRunId(progress.runId);
      }
    } catch {
      setSyncProgress(null);
    } finally {
      setSyncProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated || !accessToken) return;
    void fetchStats();
    const timer = window.setInterval(() => {
      void fetchStats();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [hasHydrated, accessToken, fetchStats]);

  useEffect(() => {
    const runId = syncRunId ?? stats?.sync.currentRunId ?? null;
    if (!hasHydrated || !accessToken || !runId || !syncModalOpen) return;

    void fetchSyncProgress(runId);
    const timer = window.setInterval(() => {
      void fetchSyncProgress(runId);
    }, 1200);

    return () => window.clearInterval(timer);
  }, [hasHydrated, accessToken, syncRunId, stats?.sync.currentRunId, syncModalOpen, fetchSyncProgress]);

  useEffect(() => {
    if (!stats?.sync.currentRunId) return;
    setSyncRunId((current) => current ?? stats.sync.currentRunId);
    if (stats.sync.isSyncing) {
      setSyncModalOpen(true);
    }
  }, [stats?.sync.currentRunId, stats?.sync.isSyncing]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api<SyncStartResult>('/admin/sync', { method: 'POST' });
      if (result.runId) {
        setSyncRunId(result.runId);
        setSyncModalOpen(true);
        await fetchSyncProgress(result.runId);
      }
      await fetchStats();
    } finally {
      setSyncing(false);
    }
  };

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
          관리자 통계를 불러오는 중입니다.
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

  const totalNodes = stats
    ? Object.values(stats.neo4j.nodes).reduce((sum, count) => sum + count, 0)
    : 0;

  const maxNodeCount = stats ? Math.max(...Object.values(stats.neo4j.nodes), 1) : 1;
  const orderedSourceStatuses = [...sourceStatuses].sort(
    (left, right) =>
      SOURCE_ORDER.indexOf(left.seedKey) - SOURCE_ORDER.indexOf(right.seedKey),
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="surface hero-grid rounded-[32px] px-7 py-8 md:px-8">
          <div className="flex flex-col gap-7">
            <AdminConsoleNav
              actions={
                <button
                  onClick={handleSync}
                  disabled={syncing || stats?.sync.isSyncing}
                  className="button-primary h-12 rounded-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw size={16} className={syncing || stats?.sync.isSyncing ? 'animate-spin' : ''} />
                  {syncing || stats?.sync.isSyncing ? '동기화 중...' : '지금 동기화'}
                </button>
              }
            />

            <div>
              <span className="section-kicker">Admin Console</span>
              <h1 className="display-text mt-5 text-4xl font-semibold text-[var(--text-primary)]">
                데이터 파이프라인과
                <br />
                벡터·그래프 적재 현황
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                현재 적재 규모, 인덱싱 상태, 동기화 결과를 한 화면에서 확인하고 즉시 갱신할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {stats?.sync.lastSyncAt && (
          <div className="surface-soft flex flex-wrap items-center gap-3 rounded-[28px] px-5 py-4 text-sm text-[var(--text-secondary)]">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                stats.sync.isSyncing ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'
              }`}
            />
            마지막 동기화: {new Date(stats.sync.lastSyncAt).toLocaleString('ko-KR')}
            {stats.sync.lastResult && !stats.sync.lastResult.success && (
              <span className="text-rose-200">일부 실패</span>
            )}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            icon={Database}
            title="총 벡터 수"
            value={stats?.qdrant.pointsCount.toLocaleString() ?? '—'}
            sub={`${stats?.qdrant.vectorSize ?? 0}차원 · ${stats?.qdrant.collection ?? '—'}`}
          />
          <StatCard
            icon={ShieldCheck}
            title="총 그래프 노드"
            value={totalNodes.toLocaleString()}
            sub={`관계 ${stats?.neo4j.relationships.toLocaleString() ?? 0}개`}
          />
          <StatCard
            icon={Activity}
            title="벡터 인덱스"
            value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '—'}
            sub={`상태: ${stats?.qdrant.status ?? '—'}`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="surface rounded-[28px] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Qdrant 벡터 DB
            </h2>
            <div className="mt-5 space-y-3">
              <InfoRow label="컬렉션" value={stats?.qdrant.collection ?? '—'} />
              <InfoRow label="벡터 차원" value={String(stats?.qdrant.vectorSize ?? '—')} />
              <InfoRow label="총 포인트" value={stats?.qdrant.pointsCount.toLocaleString() ?? '—'} />
              <InfoRow
                label="인덱싱 완료"
                value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '—'}
              />
            </div>
          </div>

          <div className="surface rounded-[28px] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Neo4j 그래프 DB
            </h2>
            <div className="mt-5 space-y-3">
              {stats &&
                Object.entries(stats.neo4j.nodes)
                  .sort(([, left], [, right]) => right - left)
                  .map(([label, count]) => (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      <div className="w-36 shrink-0 text-[var(--text-secondary)]">
                        {NODE_LABELS[label] ?? label}
                      </div>
                        <div className="h-2 flex-1 rounded-full bg-[rgba(19,32,51,0.08)]">
                          <div
                          className="h-2 rounded-full bg-[linear-gradient(135deg,#2f6f5b,#6fa288)]"
                          style={{ width: `${Math.round((count / maxNodeCount) * 100)}%` }}
                        />
                      </div>
                      <div className="w-16 text-right text-[var(--text-primary)]">{count.toLocaleString()}</div>
                    </div>
                  ))}
            </div>
          </div>
        </section>

        <section className="surface rounded-[28px] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            데이터 소스
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orderedSourceStatuses.map((source) => (
              <SourceStatusCard key={source.id} source={source} />
            ))}
          </div>
        </section>

        <section className="surface rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                최근 동기화 로그
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                크론과 수동 실행 이력을 최근 순으로 보여줍니다.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {logs.length === 0 ? (
              <div className="surface-soft rounded-[24px] px-4 py-5 text-sm text-[var(--text-secondary)]">
                아직 저장된 동기화 로그가 없습니다.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-[24px] border border-[var(--panel-border)] bg-white/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{log.seedName}</p>
                        <StatusBadge status={log.status} />
                        <TriggerBadge trigger={log.trigger} />
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {new Date(log.startedAt).toLocaleString('ko-KR')}
                        {log.finishedAt
                          ? ` -> ${new Date(log.finishedAt).toLocaleTimeString('ko-KR')}`
                          : ' -> 실행 중'}
                        {log.durationMs ? ` · ${formatDuration(log.durationMs)}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                      {log.vectorCount !== null ? <MetricPill label="벡터" value={log.vectorCount} /> : null}
                      {log.graphCount !== null ? <MetricPill label="그래프" value={log.graphCount} /> : null}
                      {log.skippedCount !== null ? <MetricPill label="스킵" value={log.skippedCount} /> : null}
                    </div>
                  </div>

                  {log.summary ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                      {log.summary}
                    </p>
                  ) : null}

                  {(log.stdout || log.stderr) ? (
                    <details className="mt-3 rounded-[18px] border border-[var(--panel-border)] bg-[rgba(248,245,239,0.7)] px-4 py-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Raw Log
                      </summary>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)]">
                        {log.stdout || ''}
                        {log.stderr ? `\n\n[stderr]\n${log.stderr}` : ''}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <SyncProgressModal
        open={syncModalOpen}
        progress={syncProgress}
        loading={syncProgressLoading}
        onClose={() => setSyncModalOpen(false)}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="surface rounded-[28px] p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
        <Icon size={18} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
        {title}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{sub}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--panel-border)] bg-white/60 px-4 py-3 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: SyncLog['status'] | SyncSourceStatus['status'] }) {
  const style =
    status === 'SUCCESS'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'FAILED'
        ? 'bg-rose-100 text-rose-700'
        : status === 'RUNNING'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-600';

  const label =
    status === 'SUCCESS' ? '성공' : status === 'FAILED' ? '실패' : status === 'RUNNING' ? '실행 중' : '대기';

  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>{label}</span>;
}

function TriggerBadge({ trigger }: { trigger: SyncLog['trigger'] }) {
  const label =
    trigger === 'CRON' ? '크론' : trigger === 'SEED' ? '개별 시드' : '수동 실행';

  return (
    <span className="rounded-full bg-[rgba(47,111,91,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-strong)]">
      {label}
    </span>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-[var(--panel-border)] bg-white/80 px-2.5 py-1">
      {label} {value.toLocaleString()}
    </span>
  );
}

function SourceStatusCard({ source }: { source: SyncSourceStatus }) {
  return (
    <div className="surface-soft rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{source.seedName}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{source.script}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={source.status} />
          <TriggerBadge trigger={source.trigger} />
        </div>
      </div>

      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        최신 실행: {new Date(source.startedAt).toLocaleString('ko-KR')}
        {source.finishedAt ? ` · 완료 ${new Date(source.finishedAt).toLocaleTimeString('ko-KR')}` : ''}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
        {source.vectorCount !== null ? <MetricPill label="벡터" value={source.vectorCount} /> : null}
        {source.graphCount !== null ? <MetricPill label="그래프" value={source.graphCount} /> : null}
        {source.skippedCount !== null ? <MetricPill label="스킵" value={source.skippedCount} /> : null}
      </div>

      <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
        {source.summary ?? source.phase ?? '최근 실행 요약이 없습니다.'}
      </p>
    </div>
  );
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}초`;
  return `${Math.floor(durationMs / 60000)}분 ${Math.round((durationMs % 60000) / 1000)}초`;
}

function SyncProgressModal({
  open,
  progress,
  loading,
  onClose,
}: {
  open: boolean;
  progress: SyncRunProgress | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,24,0.32)] p-5 backdrop-blur-sm">
      <div className="surface flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Sync Progress
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              수동 동기화 진행도
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              현재 run에서 각 시드가 어디까지 진행됐는지 실시간으로 보여줍니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--panel-border)] bg-white/80 p-3 text-[var(--text-secondary)] transition hover:bg-white"
            aria-label="동기화 진행도 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[var(--panel-border)] px-6 py-5">
          {progress ? (
            <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
              <div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {progress.completedSeeds}/{progress.totalSeeds} 시드 완료
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {progress.progressPercent}%
                  </span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-[rgba(19,32,51,0.08)]">
                  <div
                    className="h-3 rounded-full bg-[linear-gradient(135deg,#2f6f5b,#6fa288)]"
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  시작: {new Date(progress.startedAt).toLocaleString('ko-KR')}
                  {progress.finishedAt ? ` · 종료: ${new Date(progress.finishedAt).toLocaleString('ko-KR')}` : ''}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
                <RunMetric label="상태" value={progress.status === 'RUNNING' ? '실행 중' : progress.status === 'SUCCESS' ? '성공' : '실패'} />
                <RunMetric label="Run ID" value={progress.runId.slice(0, 8)} />
                <RunMetric label="현재 단계" value={progress.seeds.find((seed) => seed.status === 'RUNNING')?.seedName ?? '없음'} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-secondary)]">
              {loading ? '진행도를 불러오는 중입니다.' : '진행 중인 동기화 run이 없습니다.'}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            {(progress?.seeds ?? []).map((seed) => (
              <SeedProgressCard key={seed.id} seed={seed} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-soft rounded-[22px] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function SeedProgressCard({ seed }: { seed: SyncSeedProgress }) {
  const active = seed.status === 'RUNNING';

  return (
    <div
      className={`rounded-[26px] border px-5 py-5 transition ${
        active
          ? 'border-[rgba(47,111,91,0.28)] bg-[rgba(244,251,247,0.92)] shadow-[0_18px_36px_rgba(64,104,83,0.12)]'
          : 'border-[var(--panel-border)] bg-white/75'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{seed.seedName}</p>
            <StatusBadge status={seed.status} />
          </div>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{seed.phase ?? '대기 중'}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{seed.progressPercent}%</p>
          <p className="text-xs text-[var(--text-muted)]">{seed.progressLabel}</p>
        </div>
      </div>

      <div className="mt-4 h-2.5 rounded-full bg-[rgba(19,32,51,0.08)]">
        <div
          className="h-2.5 rounded-full bg-[linear-gradient(135deg,#2f6f5b,#6fa288)]"
          style={{ width: `${seed.progressPercent}%` }}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {seed.itemTotal !== null ? <ProgressPill label="총 대상" value={seed.itemTotal.toLocaleString()} /> : null}
        {seed.fetchTotal !== null ? (
          <ProgressPill label="수집" value={`${seed.fetchCurrent ?? 0}/${seed.fetchTotal.toLocaleString()}`} />
        ) : null}
        {seed.processTotal !== null ? (
          <ProgressPill label="처리" value={`${seed.processCurrent ?? 0}/${seed.processTotal.toLocaleString()}`} />
        ) : null}
        {seed.vectorTotal !== null ? (
          <ProgressPill label="벡터" value={`${seed.vectorCurrent ?? 0}/${seed.vectorTotal.toLocaleString()}`} />
        ) : null}
        {seed.graphTotal !== null ? (
          <ProgressPill label="그래프" value={`${seed.graphCurrent ?? 0}/${seed.graphTotal.toLocaleString()}`} />
        ) : null}
        {seed.skippedCount !== null ? <ProgressPill label="스킵" value={seed.skippedCount.toLocaleString()} /> : null}
      </div>

      {seed.summary ? (
        <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
          {seed.summary}
        </p>
      ) : null}
    </div>
  );
}

function ProgressPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--panel-border)] bg-white/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
