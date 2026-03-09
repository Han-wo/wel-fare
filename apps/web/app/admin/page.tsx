'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useUserStore } from '../../store/user.store';

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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) { router.replace('/login'); return; }
    if (userRole && userRole !== 'ADMIN') { router.replace('/chat'); }
  }, [accessToken, userRole, router]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api<Stats>('/admin/stats');
      setStats(data);
      setError(null);
    } catch {
      setError('통계 조회 실패. 로그인 상태를 확인하세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 10000); // 10초마다 갱신
    return () => clearInterval(timer);
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  const totalNodes = stats
    ? Object.values(stats.neo4j.nodes).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">데이터 관리 대시보드</h1>
            <p className="text-gray-400 text-sm mt-1">Qdrant 벡터 DB · Neo4j 그래프 DB 현황</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || stats?.sync.isSyncing}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
          >
            {syncing || stats?.sync.isSyncing ? '동기화 중...' : '지금 동기화'}
          </button>
        </div>

        {/* 동기화 상태 */}
        {stats?.sync.lastSyncAt && (
          <div className="bg-gray-900 rounded-xl p-4 text-sm text-gray-400 flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${stats.sync.isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
            마지막 동기화: {new Date(stats.sync.lastSyncAt).toLocaleString('ko-KR')}
            {stats.sync.lastResult && !stats.sync.lastResult.success && (
              <span className="text-red-400 ml-2">일부 실패</span>
            )}
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="총 벡터 수"
            value={stats?.qdrant.pointsCount.toLocaleString() ?? '—'}
            sub={`${stats?.qdrant.vectorSize ?? 0}차원 · ${stats?.qdrant.collection}`}
            color="blue"
          />
          <StatCard
            title="총 그래프 노드"
            value={totalNodes.toLocaleString()}
            sub={`관계 ${stats?.neo4j.relationships.toLocaleString() ?? 0}개`}
            color="purple"
          />
          <StatCard
            title="벡터 인덱스"
            value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '—'}
            sub={`상태: ${stats?.qdrant.status ?? '—'}`}
            color="green"
          />
        </div>

        {/* Qdrant 상세 */}
        <Section title="Qdrant 벡터 DB">
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="컬렉션" value={stats?.qdrant.collection ?? '—'} />
            <InfoRow label="벡터 차원" value={String(stats?.qdrant.vectorSize ?? '—')} />
            <InfoRow label="총 포인트" value={stats?.qdrant.pointsCount.toLocaleString() ?? '—'} />
            <InfoRow label="인덱싱 완료" value={stats?.qdrant.indexedVectorsCount.toLocaleString() ?? '—'} />
          </div>
        </Section>

        {/* Neo4j 노드별 현황 */}
        <Section title="Neo4j 그래프 DB — 노드 현황">
          <div className="space-y-2">
            {stats && Object.entries(stats.neo4j.nodes)
              .sort(([, a], [, b]) => b - a)
              .map(([label, count]) => (
                <NodeBar
                  key={label}
                  label={NODE_LABELS[label] ?? label}
                  rawLabel={label}
                  count={count}
                  max={Math.max(...Object.values(stats.neo4j.nodes))}
                />
              ))}
            <div className="pt-2 border-t border-gray-800 flex justify-between text-xs text-gray-500">
              <span>관계(Relationship)</span>
              <span>{stats?.neo4j.relationships.toLocaleString()}개</span>
            </div>
          </div>
        </Section>

        {/* 데이터 소스별 설명 */}
        <Section title="데이터 소스">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { name: '중앙부처 복지서비스', api: 'NationalWelfareInformations', schedule: '매일 새벽 2시' },
              { name: '지자체 복지서비스', api: 'LocalGovernmentWelfareInformations', schedule: '매일 새벽 2시' },
              { name: '공공임대주택 단지', api: 'HWSPR04', schedule: '매일 새벽 2시' },
              { name: '사회복지시설', api: 'sclWlfrFcltInfoInqirService1', schedule: '매일 새벽 2시' },
              { name: '공공주택 모집공고', api: 'HWSPR02', schedule: '매일 새벽 2시' },
            ].map((src) => (
              <div key={src.name} className="bg-gray-800 rounded-lg p-3">
                <div className="font-medium text-white">{src.name}</div>
                <div className="text-gray-400 text-xs mt-1">{src.api}</div>
                <div className="text-blue-400 text-xs mt-1">⏰ {src.schedule}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: 'blue' | 'purple' | 'green' }) {
  const colors = {
    blue: 'border-blue-800 bg-blue-950/40',
    purple: 'border-purple-800 bg-purple-950/40',
    green: 'border-green-800 bg-green-950/40',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="text-gray-400 text-xs mb-2">{title}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="text-gray-500 text-xs mt-1">{sub}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-800 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-mono">{value}</span>
    </div>
  );
}

function NodeBar({ label, rawLabel, count, max }: { label: string; rawLabel: string; count: number; max: number }) {
  const pct = Math.round((count / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-36 text-gray-300 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-16 text-right text-gray-400 font-mono text-xs">{count.toLocaleString()}</div>
      <div className="w-20 text-right text-gray-600 font-mono text-xs">{rawLabel}</div>
    </div>
  );
}
