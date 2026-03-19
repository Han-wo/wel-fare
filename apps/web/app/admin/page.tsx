'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Database, RefreshCcw, ShieldCheck } from 'lucide-react';
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
  lastSyncAt: string | null;
  lastResult: { success: boolean; message: string } | null;
}

interface Stats {
  qdrant: QdrantStats;
  neo4j: Neo4jStats;
  sync: SyncStatus;
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
  summary: string | null;
  stdout: string | null;
  stderr: string | null;
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

export default function AdminPage() {
  const router = useRouter();
  const userRole = useUserStore((s) => s.userRole);
  const accessToken = useUserStore((s) => s.accessToken);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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

  const fetchStats = useCallback(async () => {
    try {
      const [statsData, logData] = await Promise.all([
        api<Stats>('/admin/stats'),
        api<SyncLog[]>('/admin/sync/logs?limit=20'),
      ]);
      setStats(statsData);
      setLogs(logData);
      setError(null);
    } catch {
      setError('통계 조회에 실패했습니다. 로그인 상태와 관리자 권한을 확인하세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    const timer = window.setInterval(() => {
      void fetchStats();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchStats]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api('/admin/sync', { method: 'POST' });
      await fetchStats();
    } finally {
      setSyncing(false);
    }
  };

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
            {[
              { name: '중앙부처 복지서비스', api: 'NationalWelfareInformations', schedule: '매일 새벽 2시' },
              { name: '지자체 복지서비스', api: 'LocalGovernmentWelfareInformations', schedule: '매일 새벽 2시' },
              { name: '공공임대주택 단지', api: 'HWSPR04', schedule: '매일 새벽 2시' },
              { name: '사회복지시설', api: 'sclWlfrFcltInfoInqirService1', schedule: '매일 새벽 2시' },
              { name: '공공주택 모집공고', api: 'HWSPR02', schedule: '매일 새벽 2시' },
              { name: '청년정책', api: 'youthPolicyList', schedule: '매일 새벽 2시' },
            ].map((source) => (
              <div key={source.name} className="surface-soft rounded-[24px] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{source.name}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{source.api}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--brand)]">
                  {source.schedule}
                </p>
              </div>
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

function StatusBadge({ status }: { status: SyncLog['status'] }) {
  const style =
    status === 'SUCCESS'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'FAILED'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-amber-100 text-amber-700';

  const label =
    status === 'SUCCESS' ? '성공' : status === 'FAILED' ? '실패' : '실행 중';

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

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}초`;
  return `${Math.floor(durationMs / 60000)}분 ${Math.round((durationMs % 60000) / 1000)}초`;
}
