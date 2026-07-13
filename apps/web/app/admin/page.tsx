'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Database,
  MoreHorizontal,
  Network,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useUserStore } from '../../store/user.store';
import { AdminSidebar, AdminTopbar } from '../../components/layout/admin-sidebar';
import { StatusPill, type PipelineStatus } from '../../components/ui/status-pill';

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

interface DataFreshnessSnapshot {
  seedKey: string;
  seedName: string;
  storage: 'postgres' | 'neo4j' | 'qdrant';
  actualUpdatedAt: string | null;
  latestDataDate: string | null;
  recordCount: number | null;
  lastSuccessSyncAt: string | null;
  lastRunStatus: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | null;
  freshness: 'fresh' | 'warning' | 'stale' | 'missing';
  usesLogFallback: boolean;
  note: string | null;
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

function statusMap(status: string): PipelineStatus {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return 'success';
  if (s === 'RUNNING') return 'running';
  if (s === 'FAILED') return 'failed';
  return 'pending';
}

function triggerLabel(trigger: string): string {
  const t = trigger.toUpperCase();
  if (t === 'CRON') return '크론';
  if (t === 'SEED') return '시드';
  return '수동';
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}초`;
  return `${Math.floor(durationMs / 60000)}분 ${Math.round((durationMs % 60000) / 1000)}초`;
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ko-KR');
}

function storageLabel(storage: DataFreshnessSnapshot['storage']) {
  if (storage === 'postgres') return 'Postgres';
  if (storage === 'qdrant') return 'Qdrant';
  return 'Neo4j';
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function AdminPage() {
  const router = useRouter();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const userRole = useUserStore((s) => s.userRole);
  const accessToken = useUserStore((s) => s.accessToken);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SyncSourceStatus[]>([]);
  const [freshness, setFreshness] = useState<DataFreshnessSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncRunId, setSyncRunId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncRunProgress | null>(null);
  const [syncProgressLoading, setSyncProgressLoading] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const progressEventSourceRef = useRef<EventSource | null>(null);

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
    setRefreshing(true);
    try {
      const [statsData, logData, sourceData, freshnessData] = await Promise.all([
        api<Stats>('/admin/stats'),
        api<SyncLog[]>('/admin/sync/logs?limit=20'),
        api<SyncSourceStatus[]>('/admin/sync/sources/status'),
        api<DataFreshnessSnapshot[]>('/admin/freshness'),
      ]);
      setStats(statsData);
      setLogs(logData);
      setSourceStatuses(sourceData);
      setFreshness(freshnessData);
      setError(null);
    } catch {
      setError('통계 조회에 실패했습니다. 로그인 상태와 관리자 권한을 확인하세요.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const closeProgressStream = useCallback(() => {
    progressEventSourceRef.current?.close();
    progressEventSourceRef.current = null;
  }, []);

  useEffect(() => {
    if (!hasHydrated || !accessToken) return;
    void fetchStats();

    const handleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchStats();
    };

    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleRefresh);

    return () => {
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleRefresh);
    };
  }, [hasHydrated, accessToken, fetchStats]);

  useEffect(() => {
    const runId = syncRunId ?? stats?.sync.currentRunId ?? null;
    if (!hasHydrated || !accessToken || !runId || !syncModalOpen) {
      closeProgressStream();
      return;
    }

    closeProgressStream();
    setSyncProgressLoading(true);

    const streamUrl = `${API_BASE}/api/v1/admin/sync/stream?runId=${encodeURIComponent(runId)}&token=${encodeURIComponent(accessToken)}`;
    const source = new EventSource(streamUrl);
    progressEventSourceRef.current = source;

    source.onmessage = (event) => {
      let progress: SyncRunProgress | null = null;
      try {
        progress = JSON.parse(event.data) as SyncRunProgress;
        setSyncProgress(progress);
        setSyncRunId(progress.runId);
      } catch {
        setSyncProgress(null);
      } finally {
        setSyncProgressLoading(false);
      }

      if (
        progress &&
        source.readyState !== EventSource.CLOSED &&
        progressEventSourceRef.current === source &&
        !progress.isActive &&
        progress.status !== 'RUNNING'
      ) {
        source.close();
        if (progressEventSourceRef.current === source) {
          progressEventSourceRef.current = null;
        }
        void fetchStats();
      }
    };

    source.onerror = () => {
      source.close();
      if (progressEventSourceRef.current === source) {
        progressEventSourceRef.current = null;
      }
      setSyncProgressLoading(false);
    };

    return () => {
      source.close();
      if (progressEventSourceRef.current === source) {
        progressEventSourceRef.current = null;
      }
    };
  }, [
    hasHydrated,
    accessToken,
    syncRunId,
    stats?.sync.currentRunId,
    syncModalOpen,
    closeProgressStream,
    fetchStats,
  ]);

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
        setSyncProgress(null);
        setSyncProgressLoading(true);
      }
      await fetchStats();
    } finally {
      setSyncing(false);
    }
  };

  const totalNodes = stats
    ? Object.values(stats.neo4j.nodes).reduce((sum, count) => sum + count, 0)
    : 0;

  const maxNodeCount = stats
    ? Math.max(...Object.values(stats.neo4j.nodes), 1)
    : 1;

  const orderedSourceStatuses = useMemo(
    () =>
      [...sourceStatuses].sort(
        (left, right) =>
          SOURCE_ORDER.indexOf(left.seedKey) - SOURCE_ORDER.indexOf(right.seedKey),
      ),
    [sourceStatuses],
  );

  const orderedFreshness = useMemo(
    () =>
      [...freshness].sort(
        (left, right) =>
          SOURCE_ORDER.indexOf(left.seedKey) - SOURCE_ORDER.indexOf(right.seedKey),
      ),
    [freshness],
  );

  const sourceHealthy = useMemo(() => {
    return sourceStatuses.filter((s) => s.status === 'SUCCESS').length;
  }, [sourceStatuses]);

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
      <AdminSidebar active="sync" />

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
          title="데이터 파이프라인"
          subtitle="벡터·그래프 적재 현황을 확인하고 동기화를 관리합니다."
        />

        <div
          className="admin-content-responsive"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '22px 28px 28px',
            display: 'grid',
            gap: 18,
            gridAutoRows: 'min-content',
          }}
        >
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                fontSize: 13,
                border: '1px solid rgba(181,75,58,0.2)',
              }}
            >
              {error}
            </div>
          )}

          <div
            className="page-actions-responsive"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: stats?.sync.isSyncing ? '#c98f2b' : '#4a7c59',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {loading
                  ? '상태 확인 중...'
                  : stats?.sync.isSyncing
                    ? '동기화 실행 중'
                    : '모든 시스템 정상'}
                {stats?.sync.lastSyncAt && (
                  <>
                    {' · '}
                    마지막 동기화{' '}
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {new Date(stats.sync.lastSyncAt).toLocaleString('ko-KR')}
                    </strong>
                  </>
                )}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                style={{ height: 36 }}
                onClick={() => void fetchStats()}
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                새로고침
              </button>
              {syncRunId && (
                <button
                  className="btn-secondary"
                  style={{ height: 36 }}
                  onClick={() => setSyncModalOpen(true)}
                >
                  진행도 보기
                </button>
              )}
              <button
                className="btn-primary"
                style={{ height: 36 }}
                onClick={handleSync}
                disabled={syncing || stats?.sync.isSyncing}
              >
                <RefreshCw
                  size={14}
                  className={syncing || stats?.sync.isSyncing ? 'animate-spin' : ''}
                />
                {syncing || stats?.sync.isSyncing ? '동기화 중...' : '지금 동기화'}
              </button>
            </div>
          </div>

          <div
            className="admin-four-grid-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
            }}
          >
            <StatCard
              icon={<Database size={16} />}
              label="총 벡터"
              value={stats?.qdrant.pointsCount.toLocaleString() ?? '-'}
              sub={`${stats?.qdrant.vectorSize ?? 0}차원 · ${stats?.qdrant.collection ?? '-'}`}
            />
            <StatCard
              icon={<Network size={16} />}
              label="그래프 노드"
              value={totalNodes.toLocaleString()}
              sub={`관계 ${stats?.neo4j.relationships.toLocaleString() ?? 0}개`}
            />
            <StatCard
              icon={<Activity size={16} />}
              label="인덱싱 완료"
              value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '-'}
              sub={`상태: ${stats?.qdrant.status ?? '-'}`}
            />
            <StatCard
              icon={<Shield size={16} />}
              label="데이터 소스"
              value={`${sourceHealthy} / ${sourceStatuses.length}`}
              sub={sourceHealthy === sourceStatuses.length ? '모두 정상' : '일부 확인 필요'}
            />
          </div>

          <div
            className="admin-split-grid-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.1fr',
              gap: 14,
            }}
          >
            <Panel title="Qdrant 벡터 DB" sub="컬렉션 메타 정보" okPill>
              <div
                style={{
                  display: 'grid',
                  gap: 1,
                  background: 'var(--border)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <InfoRow label="컬렉션" value={stats?.qdrant.collection ?? '-'} />
                <InfoRow label="벡터 차원" value={String(stats?.qdrant.vectorSize ?? '-')} />
                <InfoRow
                  label="총 포인트"
                  value={stats?.qdrant.pointsCount.toLocaleString() ?? '-'}
                />
                <InfoRow
                  label="인덱싱 완료"
                  value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '-'}
                />
                <InfoRow label="상태" value={stats?.qdrant.status ?? '-'} last />
              </div>
            </Panel>

            <Panel title="Neo4j 노드 분포" sub="라벨별 노드 수" okPill>
              <div style={{ display: 'grid', gap: 12 }}>
                {stats &&
                  Object.entries(stats.neo4j.nodes)
                    .sort(([, a], [, b]) => b - a)
                    .map(([label, count]) => {
                      const pct = Math.round((count / maxNodeCount) * 100);
                      return (
                        <div key={label}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 12,
                              marginBottom: 6,
                            }}
                          >
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {NODE_LABELS[label] ?? label}
                            </span>
                            <span
                              style={{
                                color: 'var(--text-primary)',
                                fontWeight: 500,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {count.toLocaleString()}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: 'var(--bg-hover)',
                              borderRadius: 999,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: 'var(--accent)',
                                borderRadius: 999,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
              </div>
            </Panel>
          </div>

          <Panel
            title="실데이터 최신성"
            sub="실제 적재 데이터 시각과 마지막 성공 sync 로그를 함께 비교합니다."
          >
            <div
              className="admin-three-grid-responsive"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {orderedFreshness.map((item) => (
                <FreshnessCard key={item.seedKey} item={item} />
              ))}
              {orderedFreshness.length === 0 && !loading && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  최신성 데이터를 아직 불러오지 못했습니다.
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="데이터 소스"
            sub={`${sourceStatuses.length}개 시드의 최근 실행 상태`}
          >
            <div
              className="admin-three-grid-responsive"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {orderedSourceStatuses.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
              {orderedSourceStatuses.length === 0 && !loading && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  시드가 아직 실행되지 않았습니다.
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="최근 동기화 로그"
            sub="수동·크론 실행 이력"
            action={<button className="btn-ghost">전체 보기</button>}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {logs.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  저장된 동기화 로그가 없습니다.
                </div>
              ) : (
                logs.map((log) => <LogRow key={log.id} log={log} />)
              )}
            </div>
          </Panel>
        </div>
      </main>

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
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--accent-soft)',
          color: 'var(--accent-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 14,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 4,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Panel({
  title,
  sub,
  okPill,
  action,
  children,
}: {
  title: string;
  sub?: string;
  okPill?: boolean;
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
          marginBottom: 16,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            {title}
          </h3>
          {sub && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {sub}
            </p>
          )}
        </div>
        {okPill && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--success-soft)',
              color: 'var(--success)',
            }}
          >
            healthy
          </span>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '11px 14px',
        background: 'var(--bg-surface)',
        fontSize: 13,
        borderBottom: last ? 'none' : undefined,
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        style={{
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 6,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{label}</span>
      {value}
    </span>
  );
}

function TriggerTag({ trigger }: { trigger: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        background: 'var(--bg-subtle)',
      }}
    >
      {triggerLabel(trigger)}
    </span>
  );
}

function FreshnessBadge({
  freshness,
  usesLogFallback,
}: Pick<DataFreshnessSnapshot, 'freshness' | 'usesLogFallback'>) {
  const palette =
    freshness === 'fresh'
      ? {
          background: 'var(--success-soft)',
          color: 'var(--success)',
          label: '최신',
        }
      : freshness === 'warning'
        ? {
            background: 'rgba(201, 143, 43, 0.14)',
            color: '#8c641d',
            label: '주의',
          }
        : freshness === 'stale'
          ? {
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              label: '지연',
            }
          : {
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              label: '없음',
            };

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 8px',
        borderRadius: 999,
        background: palette.background,
        color: palette.color,
      }}
    >
      {palette.label}
      {usesLogFallback ? ' · 로그 기준' : ''}
    </span>
  );
}

function FreshnessCard({ item }: { item: DataFreshnessSnapshot }) {
  return (
    <div
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {item.seedName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 3,
            }}
          >
            저장소 {storageLabel(item.storage)}
          </div>
        </div>
        <FreshnessBadge
          freshness={item.freshness}
          usesLogFallback={item.usesLogFallback}
        />
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <InfoStack label="실데이터 시각" value={formatDateTime(item.actualUpdatedAt)} />
        <InfoStack
          label="마지막 성공 로그"
          value={formatDateTime(item.lastSuccessSyncAt)}
        />
        <InfoStack label="최신 도메인 날짜" value={item.latestDataDate ?? '-'} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        {item.recordCount !== null && (
          <Metric label="레코드" value={item.recordCount.toLocaleString()} />
        )}
        {item.lastRunStatus && (
          <Metric label="최근 상태" value={item.lastRunStatus} />
        )}
      </div>

      {item.note && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {item.note}
        </div>
      )}
    </div>
  );
}

function InfoStack({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-primary)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: SyncSourceStatus }) {
  return (
    <div
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {source.seedName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {source.script}
          </div>
        </div>
        <StatusPill status={statusMap(source.status)} />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        {source.vectorCount !== null && (
          <Metric label="벡터" value={source.vectorCount.toLocaleString()} />
        )}
        {source.graphCount !== null && (
          <Metric label="그래프" value={source.graphCount.toLocaleString()} />
        )}
        {source.skippedCount !== null && source.skippedCount > 0 && (
          <Metric label="스킵" value={source.skippedCount.toLocaleString()} />
        )}
        {source.vectorCount === null && source.status === 'RUNNING' && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>진행 중...</span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {formatTime(source.startedAt)}
        </span>
        <TriggerTag trigger={source.trigger} />
      </div>
    </div>
  );
}

function LogRow({ log }: { log: SyncLog }) {
  return (
    <div
      className="admin-log-row-responsive"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <StatusPill status={statusMap(log.status)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {log.seedName}
          </span>
          <TriggerTag trigger={log.trigger} />
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTime(log.startedAt)}
          </span>
        </div>
        {log.summary && log.status === 'FAILED' && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>
            {log.summary.slice(0, 120)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {log.vectorCount !== null && (
          <Metric label="벡터" value={log.vectorCount.toLocaleString()} />
        )}
        {log.graphCount !== null && (
          <Metric label="그래프" value={log.graphCount.toLocaleString()} />
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          minWidth: 90,
          textAlign: 'right',
        }}
      >
        {log.durationMs ? formatDuration(log.durationMs) : log.status === 'RUNNING' ? '실행 중' : '-'}
      </span>
      <button className="btn-ghost" style={{ padding: 6 }}>
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 16, 24, 0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          maxHeight: '85vh',
          width: '100%',
          maxWidth: 960,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
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
              Sync Progress
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: '6px 0 0',
              }}
            >
              수동 동기화 진행도
            </h2>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                margin: '4px 0 0',
              }}
            >
              현재 run에서 각 시드가 어디까지 진행됐는지 실시간으로 보여줍니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: 8 }}
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {progress ? (
            <div
              className="admin-modal-summary-responsive"
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.6fr',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {progress.completedSeeds} / {progress.totalSeeds} 시드 완료
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {progress.progressPercent}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: 'var(--bg-hover)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress.progressPercent}%`,
                      height: '100%',
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 8,
                  }}
                >
                  시작 {new Date(progress.startedAt).toLocaleString('ko-KR')}
                  {progress.finishedAt &&
                    ` · 종료 ${new Date(progress.finishedAt).toLocaleString('ko-KR')}`}
                </p>
              </div>
              <div
                className="admin-modal-grid-responsive"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                }}
              >
                <RunMetric
                  label="상태"
                  value={
                    progress.status === 'RUNNING'
                      ? '실행 중'
                      : progress.status === 'SUCCESS'
                        ? '성공'
                        : '실패'
                  }
                />
                <RunMetric label="Run ID" value={progress.runId.slice(0, 8)} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {loading
                ? '진행도를 불러오는 중입니다.'
                : '진행 중인 동기화 run이 없습니다.'}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
          <div
            className="admin-modal-grid-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
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
    <div
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SeedProgressCard({ seed }: { seed: SyncSeedProgress }) {
  const active = seed.status === 'RUNNING';
  return (
    <div
      style={{
        border: `1px solid ${active ? 'rgba(45,106,95,0.28)' : 'var(--border)'}`,
        background: active ? 'rgba(223,236,232,0.5)' : 'var(--bg-subtle)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
              }}
            >
              {seed.seedName}
            </span>
            <StatusPill status={statusMap(seed.status)} />
          </div>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              margin: '4px 0 0',
            }}
          >
            {seed.phase ?? '대기 중'}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {seed.progressPercent}%
          </p>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              margin: '2px 0 0',
            }}
          >
            {seed.progressLabel}
          </p>
        </div>
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--bg-hover)',
          overflow: 'hidden',
          marginTop: 12,
        }}
      >
        <div
          style={{
            width: `${seed.progressPercent}%`,
            height: '100%',
            background: 'var(--accent)',
          }}
        />
      </div>

      <div
        className="admin-three-grid-responsive"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          marginTop: 12,
        }}
      >
        {seed.itemTotal !== null && (
          <ProgressPill label="총 대상" value={seed.itemTotal.toLocaleString()} />
        )}
        {seed.fetchTotal !== null && (
          <ProgressPill
            label="수집"
            value={`${seed.fetchCurrent ?? 0}/${seed.fetchTotal.toLocaleString()}`}
          />
        )}
        {seed.processTotal !== null && (
          <ProgressPill
            label="처리"
            value={`${seed.processCurrent ?? 0}/${seed.processTotal.toLocaleString()}`}
          />
        )}
        {seed.vectorTotal !== null && (
          <ProgressPill
            label="벡터"
            value={`${seed.vectorCurrent ?? 0}/${seed.vectorTotal.toLocaleString()}`}
          />
        )}
        {seed.graphTotal !== null && (
          <ProgressPill
            label="그래프"
            value={`${seed.graphCurrent ?? 0}/${seed.graphTotal.toLocaleString()}`}
          />
        )}
        {seed.skippedCount !== null && seed.skippedCount > 0 && (
          <ProgressPill label="스킵" value={seed.skippedCount.toLocaleString()} />
        )}
      </div>

      {seed.summary && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginTop: 12,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          }}
        >
          {seed.summary}
        </p>
      )}
    </div>
  );
}

function ProgressPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '6px 10px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
