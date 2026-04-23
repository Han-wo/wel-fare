/* Admin — 동기화 현황 (리디자인) */
const { useState: useAdminSyncState } = React;

function AdminSyncScreen() {
  const [active] = useAdminSyncState('sync');

  return (
    <div className="artboard-root" style={adminStyles.root}>
      <AdminSidebar active={active} />

      <main style={adminStyles.main}>
        <AdminTopbar title="데이터 파이프라인" subtitle="벡터·그래프 적재 현황을 확인하고 동기화를 관리합니다." />

        <div style={adminStyles.content}>
          {/* Status strip */}
          <div style={adminStyles.statusStrip}>
            <div style={adminStyles.statusLeft}>
              <span style={{ ...adminStyles.statusDot, background: '#4a7c59' }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                모든 시스템 정상 · 마지막 동기화 <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>오늘 14:32</strong>
              </span>
            </div>
            <button className="btn-primary" style={{ height: 36 }}>
              <IconRefresh size={14} />
              지금 동기화
            </button>
          </div>

          {/* Stat cards */}
          <div style={adminStyles.statGrid}>
            <StatCard icon={<IconDatabase size={16} />} label="총 벡터" value="142,836" sub="1,536차원 · welfare" />
            <StatCard icon={<IconNetwork size={16} />} label="그래프 노드" value="58,210" sub="관계 312,440개" />
            <StatCard icon={<IconActivity size={16} />} label="인덱싱 완료" value="142,100" sub="상태: green" trend="+2.1%" />
            <StatCard icon={<IconShield size={16} />} label="데이터 소스" value="9 / 9" sub="모두 정상" />
          </div>

          {/* Two-column: DB details + Node distribution */}
          <div style={adminStyles.twoCol}>
            <section style={adminStyles.panel}>
              <div style={adminStyles.panelHead}>
                <div>
                  <h3 style={adminStyles.panelTitle}>Qdrant 벡터 DB</h3>
                  <p style={adminStyles.panelSub}>컬렉션 메타 정보</p>
                </div>
                <span style={adminStyles.okPill}>healthy</span>
              </div>
              <div style={{ display: 'grid', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <InfoRow label="컬렉션" value="welfare_v2" />
                <InfoRow label="벡터 차원" value="1,536" />
                <InfoRow label="총 포인트" value="142,836" />
                <InfoRow label="인덱싱 완료" value="142,100 (99.5%)" />
                <InfoRow label="스토리지" value="4.2 GB" last />
              </div>
            </section>

            <section style={adminStyles.panel}>
              <div style={adminStyles.panelHead}>
                <div>
                  <h3 style={adminStyles.panelTitle}>Neo4j 노드 분포</h3>
                  <p style={adminStyles.panelSub}>라벨별 노드 수</p>
                </div>
                <span style={adminStyles.okPill}>healthy</span>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <NodeBar label="중앙/지자체 복지정책" count={24820} max={24820} />
                <NodeBar label="사회복지시설" count={18402} max={24820} />
                <NodeBar label="공공임대단지" count={6120} max={24820} />
                <NodeBar label="모집공고" count={3840} max={24820} />
                <NodeBar label="정책주제" count={2150} max={24820} />
                <NodeBar label="생애주기" count={1820} max={24820} />
                <NodeBar label="대상자" count={1058} max={24820} />
              </div>
            </section>
          </div>

          {/* Data sources grid */}
          <section style={adminStyles.panel}>
            <div style={adminStyles.panelHead}>
              <div>
                <h3 style={adminStyles.panelTitle}>데이터 소스</h3>
                <p style={adminStyles.panelSub}>9개 시드의 최근 실행 상태</p>
              </div>
            </div>
            <div style={adminStyles.sourceGrid}>
              <SourceCard name="중앙부처 복지" script="welfare.ts" status="success" vector={42100} graph={12400} time="14:32" trigger="cron" />
              <SourceCard name="지자체 복지" script="local-welfare.ts" status="success" vector={28640} graph={8210} time="14:29" trigger="cron" />
              <SourceCard name="청년정책" script="youth-policy.ts" status="running" vector={null} graph={null} time="14:35" trigger="manual" />
              <SourceCard name="공공임대" script="rental-housing.ts" status="success" vector={6120} graph={2450} time="14:15" trigger="cron" />
              <SourceCard name="복지시설" script="facility.ts" status="success" vector={18402} graph={18402} time="13:48" trigger="cron" />
              <SourceCard name="모집공고" script="housing-announcement.ts" status="failed" vector={null} graph={null} time="13:22" trigger="cron" />
            </div>
          </section>

          {/* Logs */}
          <section style={adminStyles.panel}>
            <div style={adminStyles.panelHead}>
              <div>
                <h3 style={adminStyles.panelTitle}>최근 동기화 로그</h3>
                <p style={adminStyles.panelSub}>수동·크론 실행 이력</p>
              </div>
              <button className="btn-ghost">전체 보기</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <LogRow name="청년정책" status="running" trigger="manual" time="14:35:02" duration="진행 중 · 42%" />
              <LogRow name="중앙부처 복지" status="success" trigger="cron" time="14:32:10" duration="1분 24초" vector={42100} graph={12400} />
              <LogRow name="지자체 복지" status="success" trigger="cron" time="14:29:48" duration="2분 12초" vector={28640} graph={8210} />
              <LogRow name="모집공고" status="failed" trigger="cron" time="13:22:05" duration="0.8초" summary="API timeout (5000ms)" />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ---------- Shared admin chrome (sidebar + topbar) ---------- */

function AdminSidebar({ active }) {
  return (
    <aside style={adminStyles.sidebar}>
      <div style={adminStyles.sidebarHead}>
        <span className="brand-mark">W</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>welFareAI</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Admin Console</div>
        </div>
      </div>

      <div style={{ padding: '16px 10px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Monitoring
      </div>
      <nav style={{ display: 'grid', gap: 2, padding: '0 8px' }}>
        <SidebarItem icon={<IconDatabase size={15} />} label="동기화 현황" active={active === 'sync'} />
        <SidebarItem icon={<IconWorkflow size={15} />} label="AI 추적" active={active === 'trace'} />
        <SidebarItem icon={<IconActivity size={15} />} label="사용량 통계" />
        <SidebarItem icon={<IconShield size={15} />} label="권한 관리" />
      </nav>

      <div style={{ padding: '20px 10px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Settings
      </div>
      <nav style={{ display: 'grid', gap: 2, padding: '0 8px' }}>
        <SidebarItem icon={<IconSettings size={15} />} label="시스템 설정" />
        <SidebarItem icon={<IconFileText size={15} />} label="문서" />
      </nav>

      <div style={{ flex: 1 }} />

      <div style={adminStyles.sidebarUser}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
          JH
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>정현우</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>admin@welfare.ai</div>
        </div>
        <button className="btn-ghost" style={{ padding: 6 }}>
          <IconLogout size={14} />
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({ icon, label, active }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: active ? 'var(--bg-surface)' : 'transparent',
      border: active ? '1px solid var(--border)' : '1px solid transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontSize: 13, fontWeight: active ? 500 : 400,
      letterSpacing: '-0.01em', cursor: 'pointer', textAlign: 'left',
      boxShadow: active ? 'var(--shadow-sm)' : 'none',
    }}>
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{icon}</span>
      {label}
    </button>
  );
}

function AdminTopbar({ title, subtitle, children }) {
  return (
    <div style={adminStyles.topbar}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <button className="btn-ghost" style={{ padding: 8 }}>
          <IconBell size={16} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>JH</div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>정현우</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Pieces ---------- */

function StatCard({ icon, label, value, sub, trend }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', background: 'var(--success-soft)', padding: '2px 6px', borderRadius: 4 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg-surface)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function NodeBar({ label, count, max }) {
  const pct = Math.round((count / max) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{count.toLocaleString()}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-hover)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const colors = { success: '#4a7c59', running: '#c98f2b', failed: '#b54b3a', pending: '#8a8678' };
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: colors[status], display: 'inline-block' }} />;
}

function StatusPill({ status }) {
  const map = {
    success: { bg: 'var(--success-soft)', color: 'var(--success)', label: '성공' },
    running: { bg: '#fdf2d9', color: '#8a5d10', label: '실행 중' },
    failed:  { bg: '#f6e2de', color: 'var(--danger)', label: '실패' },
    pending: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', label: '대기' },
  };
  const s = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color }}>
      <StatusDot status={status} /> {s.label}
    </span>
  );
}

function TriggerTag({ trigger }) {
  const label = trigger === 'cron' ? '크론' : trigger === 'manual' ? '수동' : '시드';
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}>
      {label}
    </span>
  );
}

function SourceCard({ name, script, status, vector, graph, time, trigger }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{script}</div>
        </div>
        <StatusPill status={status} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {vector !== null && <Metric label="벡터" value={vector.toLocaleString()} />}
        {graph !== null && <Metric label="그래프" value={graph.toLocaleString()} />}
        {vector === null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>진행 중...</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{time}</span>
        <TriggerTag trigger={trigger} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{label}</span>{value}
    </span>
  );
}

function LogRow({ name, status, trigger, time, duration, vector, graph, summary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <StatusPill status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>{name}</span>
          <TriggerTag trigger={trigger} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
        </div>
        {summary && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>{summary}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {vector && <Metric label="벡터" value={vector.toLocaleString()} />}
        {graph && <Metric label="그래프" value={graph.toLocaleString()} />}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>{duration}</span>
      <button className="btn-ghost" style={{ padding: 6 }}>
        <IconMore size={14} />
      </button>
    </div>
  );
}

/* ---------- styles ---------- */

const adminStyles = {
  root: { display: 'flex', background: 'var(--bg-canvas)' },
  sidebar: {
    width: 240, flexShrink: 0, background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
    padding: '14px 0',
  },
  sidebarHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 16px', borderBottom: '1px solid var(--border)' },
  sidebarUser: {
    display: 'flex', alignItems: 'center', gap: 10, padding: 12,
    margin: '0 10px 4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 28px', background: 'var(--bg-canvas)',
    borderBottom: '1px solid var(--border)',
  },
  content: { flex: 1, overflowY: 'auto', padding: '22px 28px 28px', display: 'grid', gap: 18 },
  statusStrip: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
  },
  statusLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 14 },
  panel: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  panelTitle: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 },
  panelSub: { fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' },
  okPill: {
    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
    background: 'var(--success-soft)', color: 'var(--success)',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  sourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
};

Object.assign(window, { AdminSyncScreen, AdminSidebar, AdminTopbar, StatusPill, StatusDot });
