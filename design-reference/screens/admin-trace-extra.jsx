/* Admin — AI 추적: Graph view + Events timeline */

function AdminTraceGraphScreen() {
  return (
    <div className="artboard-root" style={adminStyles.root}>
      <AdminSidebar active="trace" />

      <main style={adminStyles.main}>
        <AdminTopbar title="AI 추적" subtitle="질문의 판단 근거를 그래프로 시각화합니다." />

        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0 }}>
          {/* Reuse list */}
          <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>최근 trace</h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>30개</span>
              </div>
              <div style={{ position: 'relative', marginTop: 10 }}>
                <IconSearch size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="input" placeholder="질문 검색..." style={{ paddingLeft: 28, height: 32, fontSize: 12 }} />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'grid', gap: 4 }}>
              <TraceListItem question="청년 월세 지원 받을 수 있을까요?" status="success" route="policy" time="방금 전" />
              <TraceListItem question="서울 강동구 30대 1인가구 받을 수 있는 주거 지원" status="success" route="housing" time="3분 전" selected tools={['vector_search','graph_walk']} />
              <TraceListItem question="육아휴직 급여 신청 방법" status="running" route="policy" time="5분 전" />
              <TraceListItem question="기초생활수급자 자격 요건" status="success" route="policy" time="12분 전" />
              <TraceListItem question="장애인 활동지원 서비스" status="failed" route="facility" time="18분 전" />
            </div>
          </aside>

          <section style={{ overflowY: 'auto', padding: '22px 26px 28px', display: 'grid', gap: 16, background: 'var(--bg-canvas)' }}>
            {/* Header (collapsed) */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <StatusPill status="success" />
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>housing</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>2025.01.14 14:32:08 · 1.42s</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                서울 강동구 30대 1인가구가 받을 수 있는 주거 지원 알려줘
              </h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, borderBottom: '1px solid var(--border)', marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 }}>
                <Tab icon={<IconFileText size={13} />} label="개요" />
                <Tab icon={<IconWorkflow size={13} />} label="그래프" active />
                <Tab icon={<IconActivity size={13} />} label="이벤트 타임라인" />
              </div>
            </div>

            {/* Graph panel */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <h3 style={adminStyles.panelTitle}>그래프 탐색 시각화</h3>
                  <p style={adminStyles.panelSub}>질문 → 라우팅 → 도구 → 검색 결과 → 그래프 확장</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12 }}>
                    <IconPlus size={12} />확대
                  </button>
                  <button className="btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12 }}>
                    <IconSearch size={12} />맞춤
                  </button>
                </div>
              </div>

              <GraphCanvas />

              {/* Legend */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <LegendItem color="#2d6a5f" label="질문" />
                <LegendItem color="#c98f2b" label="라우터" />
                <LegendItem color="#4a7c59" label="도구" />
                <LegendItem color="#6b8fb2" label="벡터 후보" />
                <LegendItem color="#a67cc2" label="그래프 노드" />
              </div>
            </div>

            {/* Node inspector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={adminStyles.panel}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                  선택된 노드
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#6b8fb2' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>서울시 청년 매입임대</span>
                </div>
                <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                  <RowKV k="ID" v="policy_42108" />
                  <RowKV k="Kind" v="HousingAnnouncement" />
                  <RowKV k="벡터 score" v="0.89" />
                  <RowKV k="지역" v="서울 강동구" />
                  <RowKV k="대상" v="만 19~39세 무주택 청년" />
                </div>
              </div>

              <div style={adminStyles.panel}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                  연결된 관계 (4)
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <EdgeRow from="서울시 청년 매입임대" label="TARGETS" to="만 19~39세" />
                  <EdgeRow from="서울시 청년 매입임대" label="LOCATED_IN" to="강동구" />
                  <EdgeRow from="서울시 청년 매입임대" label="SIMILAR_TO" to="역세권 청년주택" />
                  <EdgeRow from="서울시 청년 매입임대" label="PROVIDED_BY" to="SH공사" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function AdminTraceEventsScreen() {
  return (
    <div className="artboard-root" style={adminStyles.root}>
      <AdminSidebar active="trace" />

      <main style={adminStyles.main}>
        <AdminTopbar title="AI 추적" subtitle="질문 실행 중 발생한 모든 이벤트를 순서대로 확인합니다." />

        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0 }}>
          <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>판단 단계</h3>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>카테고리별 필터</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gap: 14 }}>
              <EventGroup title="도구 선택" count={2} items={[
                { time: '08.12', title: '질문 라우팅', detail: 'keyword match → housing' },
                { time: '09.21', title: 'profile_lookup', detail: '사용자 프로필 조회' },
              ]} />
              <EventGroup title="벡터 검색" count={3} items={[
                { time: '08.34', title: 'welfare_v2 쿼리', detail: 'top-k 8 / 평균 0.82' },
                { time: '08.41', title: '재랭킹', detail: 'cross-encoder / 3건 선정' },
                { time: '08.52', title: '필터 적용', detail: '지역 = 서울' },
              ]} />
              <EventGroup title="그래프 확장" count={2} items={[
                { time: '08.78', title: 'Region → Policy', detail: '강동구 시작점' },
                { time: '09.04', title: '관계 순회', detail: 'TARGETS · LOCATED_IN' },
              ]} />
            </div>
          </aside>

          <section style={{ overflowY: 'auto', padding: '22px 26px 28px', display: 'grid', gap: 16, background: 'var(--bg-canvas)' }}>
            {/* Compact header + tabs */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <StatusPill status="success" />
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>housing</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>2025.01.14 14:32:08 · 1.42s · 7 events</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                서울 강동구 30대 1인가구가 받을 수 있는 주거 지원 알려줘
              </h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, borderBottom: '1px solid var(--border)', marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 }}>
                <Tab icon={<IconFileText size={13} />} label="개요" />
                <Tab icon={<IconWorkflow size={13} />} label="그래프" />
                <Tab icon={<IconActivity size={13} />} label="이벤트 타임라인" active />
              </div>
            </div>

            {/* Full timeline */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={adminStyles.panelTitle}>이벤트 타임라인</h3>
                  <p style={adminStyles.panelSub}>전체 7개 이벤트 · 원본 payload 확장 가능</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <FilterChip active>전체</FilterChip>
                  <FilterChip>판단</FilterChip>
                  <FilterChip>벡터</FilterChip>
                  <FilterChip>그래프</FilterChip>
                  <FilterChip>답변</FilterChip>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 0 }}>
                <EventRow time="14:32:08.12" type="route" title="세션 시작" detail="user_id: u_18492 · session: s_a8f3e1" />
                <EventRow time="14:32:08.24" type="route" title="질문 라우팅 → housing" detail="keyword: 주거, 임대, 강동구 / confidence 0.91" payload />
                <EventRow time="14:32:08.34" type="vector" title="벡터 검색 (top-k 8)" detail="welfare_v2 / 평균 score 0.82" payload />
                <EventRow time="14:32:08.78" type="graph" title="그래프 확장" detail="Region(강동구) → HousingAnnouncement / 18 노드" payload />
                <EventRow time="14:32:09.12" type="tool" title="profile_lookup" detail="1인가구, 30대, 무주택 필터 적용" />
                <EventRow time="14:32:09.21" type="vector" title="재랭킹" detail="cross-encoder / 상위 3건 선정" />
                <EventRow time="14:32:09.44" type="answer" title="답변 생성 완료" detail="3개 상품 추천 · 출처 2건 인용 · 2,142 tokens" last />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ---------- Graph canvas (static SVG) ---------- */

function GraphCanvas() {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, position: 'relative', overflow: 'hidden' }}>
      <svg viewBox="0 0 900 460" width="100%" height="460" style={{ display: 'block' }}>
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(138,134,120,0.12)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="900" height="460" fill="url(#grid)" />

        {/* Edges */}
        <g stroke="#d6d1c2" strokeWidth="1.5" fill="none">
          <path d="M 90 230 L 230 230" />
          <path d="M 290 230 L 420 160" />
          <path d="M 290 230 L 420 300" />
          <path d="M 490 160 Q 560 130, 650 120" />
          <path d="M 490 160 Q 560 160, 650 200" />
          <path d="M 490 160 Q 560 180, 650 260" />
          <path d="M 490 300 Q 580 320, 680 340" />
          <path d="M 490 300 Q 570 370, 680 410" />
          <path d="M 700 120 L 820 180" />
          <path d="M 700 200 L 820 180" />
          <path d="M 700 260 L 820 260" />
          <path d="M 710 340 L 820 330" />
        </g>

        {/* Highlighted path */}
        <g stroke="#2d6a5f" strokeWidth="2.2" fill="none" strokeDasharray="none">
          <path d="M 90 230 L 230 230" />
          <path d="M 290 230 L 420 160" />
          <path d="M 490 160 Q 560 160, 650 200" />
        </g>

        {/* Nodes */}
        {/* Question */}
        <GNode cx={60} cy={230} r={20} color="#2d6a5f" label="질문" labelColor="#fff" />
        {/* Router */}
        <GNode cx={260} cy={230} r={22} color="#c98f2b" label="router" labelColor="#fff" />
        {/* Tools */}
        <GNode cx={460} cy={160} r={20} color="#4a7c59" label="vector" labelColor="#fff" highlighted />
        <GNode cx={460} cy={300} r={20} color="#4a7c59" label="graph" labelColor="#fff" />
        {/* Vector results */}
        <GNode cx={670} cy={120} r={16} color="#6b8fb2" />
        <GNode cx={670} cy={200} r={18} color="#6b8fb2" highlighted />
        <GNode cx={670} cy={260} r={15} color="#6b8fb2" />
        {/* Graph nodes */}
        <GNode cx={690} cy={340} r={14} color="#a67cc2" />
        <GNode cx={690} cy={410} r={14} color="#a67cc2" />
        {/* Leaf */}
        <GNode cx={830} cy={180} r={13} color="#b8b2a0" />
        <GNode cx={830} cy={260} r={13} color="#b8b2a0" />
        <GNode cx={830} cy={330} r={13} color="#b8b2a0" />

        {/* Text labels */}
        <g fontFamily="Pretendard Variable, sans-serif" fontSize="11" fill="#4a473e">
          <text x={60} y={270} textAnchor="middle" fontWeight="600">질문</text>
          <text x={260} y={275} textAnchor="middle" fontWeight="600">라우터</text>
          <text x={460} y={135} textAnchor="middle" fontWeight="600">vector_search</text>
          <text x={460} y={340} textAnchor="middle" fontWeight="600">graph_walk</text>
          <text x={698} y={198} fontSize="10" fill="#1a1915" fontWeight="600">청년 매입임대</text>
          <text x={698} y={124} fontSize="10">역세권 청년주택</text>
          <text x={698} y={264} fontSize="10">행복주택</text>
          <text x={707} y={344} fontSize="10">강동구</text>
          <text x={707} y={414} fontSize="10">1인가구</text>
        </g>
      </svg>

      {/* Stats overlay */}
      <div style={{ position: 'absolute', top: 14, right: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 14, fontSize: 11 }}>
        <span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>12</strong> <span style={{ color: 'var(--text-muted)' }}>노드</span></span>
        <span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>13</strong> <span style={{ color: 'var(--text-muted)' }}>관계</span></span>
      </div>
    </div>
  );
}

function GNode({ cx, cy, r, color, highlighted }) {
  return (
    <g>
      {highlighted && <circle cx={cx} cy={cy} r={r + 5} fill={color} opacity="0.15" />}
      <circle cx={cx} cy={cy} r={r} fill={color} stroke={highlighted ? '#fff' : 'transparent'} strokeWidth="2" />
    </g>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {label}
    </div>
  );
}

function EdgeRow({ from, label, to }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, flex: '0 0 auto', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from}</span>
      <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', padding: '2px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-text)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to}</span>
    </div>
  );
}

function EventGroup({ title, count, items }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em' }}>{it.title}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{it.time}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{it.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ children, active }) {
  return (
    <button style={{
      fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 999,
      background: active ? 'var(--accent)' : 'var(--bg-surface)',
      color: active ? '#fff' : 'var(--text-secondary)',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
      cursor: 'pointer', letterSpacing: '-0.01em',
    }}>
      {children}
    </button>
  );
}

function EventRow({ time, type, title, detail, payload, last }) {
  const typeColor = {
    route: '#c98f2b', vector: '#6b8fb2', graph: '#a67cc2', tool: '#4a7c59', answer: '#2d6a5f',
  }[type];
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ flexShrink: 0, width: 80, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}>
        {time}
      </div>
      <div style={{ flexShrink: 0, position: 'relative', width: 10 }}>
        <span style={{ display: 'block', width: 8, height: 8, borderRadius: 999, background: typeColor, marginTop: 6 }} />
        {!last && <span style={{ position: 'absolute', left: 3.5, top: 18, bottom: -14, width: 1, background: 'var(--border)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.6 }}>{detail}</div>
        {payload && (
          <button style={{ marginTop: 6, padding: '4px 8px', fontSize: 11, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconChevronDown size={11} />
            Raw Payload
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AdminTraceGraphScreen, AdminTraceEventsScreen });
