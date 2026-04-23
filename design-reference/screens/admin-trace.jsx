/* Admin — AI 추적 (리디자인) */

function AdminTraceScreen() {
  const selectedId = 't-02';
  return (
    <div className="artboard-root" style={adminStyles.root}>
      <AdminSidebar active="trace" />

      <main style={adminStyles.main}>
        <AdminTopbar title="AI 추적" subtitle="질문별 판단 근거와 도구 호출 흐름을 확인합니다." />

        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0 }}>
          {/* Trace list */}
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
              <TraceListItem id="t-01" question="청년 월세 지원 받을 수 있을까요?" status="success" route="policy" time="방금 전" selected={selectedId === 't-01'} />
              <TraceListItem id="t-02" question="서울 강동구 30대 1인가구 받을 수 있는 주거 지원" status="success" route="housing" time="3분 전" selected={selectedId === 't-02'} tools={['vector_search','graph_walk']} />
              <TraceListItem id="t-03" question="육아휴직 급여 신청 방법" status="running" route="policy" time="5분 전" />
              <TraceListItem id="t-04" question="기초생활수급자 자격 요건" status="success" route="policy" time="12분 전" />
              <TraceListItem id="t-05" question="장애인 활동지원 서비스" status="failed" route="facility" time="18분 전" />
              <TraceListItem id="t-06" question="노인 일자리 사업 종류" status="success" route="policy" time="25분 전" />
              <TraceListItem id="t-07" question="국민임대 vs 행복주택 차이" status="success" route="housing" time="34분 전" />
            </div>
          </aside>

          {/* Detail */}
          <section style={{ overflowY: 'auto', padding: '22px 26px 28px', display: 'grid', gap: 16, background: 'var(--bg-canvas)' }}>
            {/* Header */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <StatusPill status="success" />
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>housing</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>2025.01.14 14:32:08 · 1.42s</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.35, margin: 0 }}>
                서울 강동구 30대 1인가구가 받을 수 있는 주거 지원 알려줘
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '12px 0 0', maxWidth: 720 }}>
                사용자 프로필(서울·1인가구·30대)과 일치하는 공공임대·청년주택 상품 3건을 벡터 검색으로 상위 후보 추리고, 지역·대상 관계 그래프로 자격 교차 확인 후 답변을 생성했습니다.
              </p>

              {/* View tabs */}
              <div style={{ display: 'flex', gap: 6, marginTop: 18, borderBottom: '1px solid var(--border)', marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 }}>
                <Tab icon={<IconFileText size={13} />} label="개요" active />
                <Tab icon={<IconWorkflow size={13} />} label="그래프" />
                <Tab icon={<IconActivity size={13} />} label="이벤트 타임라인" />
              </div>

              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18 }}>
                <MiniStat icon={<IconBot size={14} />} label="도구" value="2" sub="vector + graph" />
                <MiniStat icon={<IconSearch size={14} />} label="벡터 단계" value="3" sub="top-k 8" />
                <MiniStat icon={<IconNetwork size={14} />} label="그래프 단계" value="2" sub="18 노드 확장" />
                <MiniStat icon={<IconClock size={14} />} label="소요 시간" value="1.42s" sub="평균 1.8s" />
              </div>
            </div>

            {/* Two col: Answer + meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
              <div style={adminStyles.panel}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                  최종 답변
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-primary)' }}>
                  <p style={{ margin: '0 0 12px' }}>현재 프로필 기준 매칭되는 주거 지원 3가지입니다.</p>
                  <ol style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 8 }}>
                    <li><strong>서울시 청년 매입임대</strong> — 만 19~39세 무주택 청년 대상. 강동구 공고 2건.</li>
                    <li><strong>역세권 청년주택</strong> — 주변 시세 대비 30~95% 수준. 신청 1월 22일까지.</li>
                    <li><strong>행복주택 (1인가구형)</strong> — 소득 기준 도시근로자 100% 이하.</li>
                  </ol>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>출처: 서울특별시 주택정책과 · 국토교통부 (2025.01)</p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={adminStyles.panel}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                    사용한 도구
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <ToolBadge>vector_search</ToolBadge>
                    <ToolBadge>graph_walk</ToolBadge>
                    <ToolBadge>profile_lookup</ToolBadge>
                  </div>
                </div>
                <div style={adminStyles.panel}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                    모델 정보
                  </div>
                  <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                    <RowKV k="Route" v="housing" />
                    <RowKV k="Model" v="claude-sonnet-4" />
                    <RowKV k="Tokens" v="2,142 / 1,024" />
                    <RowKV k="Run ID" v="a8f3e1c4..." />
                  </div>
                </div>
              </div>
            </div>

            {/* Decision timeline preview */}
            <div style={adminStyles.panel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <h3 style={adminStyles.panelTitle}>판단 단계 요약</h3>
                  <p style={adminStyles.panelSub}>6개 이벤트 · 자세한 내역은 이벤트 타임라인 탭</p>
                </div>
                <button className="btn-ghost">전체 이벤트 보기</button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <TimelineStep time="14:32:08.12" type="route" title="질문 라우팅 → housing" detail="keyword: 주거, 임대, 강동구 / confidence 0.91" />
                <TimelineStep time="14:32:08.34" type="vector" title="벡터 검색 (top-k 8)" detail="쿼리 embedding → welfare_v2 컬렉션 / 평균 score 0.82" />
                <TimelineStep time="14:32:08.78" type="graph" title="그래프 확장" detail="Region(강동구) → HousingAnnouncement / 18 노드 탐색" />
                <TimelineStep time="14:32:09.21" type="tool" title="profile_lookup" detail="사용자 프로필 필터 적용: 1인가구, 30대, 무주택" />
                <TimelineStep time="14:32:09.44" type="answer" title="답변 생성 완료" detail="3개 상품 추천 · 출처 2건 인용" last />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ---------- Pieces ---------- */

function TraceListItem({ question, status, route, time, selected, tools = [] }) {
  return (
    <button style={{
      display: 'grid', gap: 8, padding: 12, borderRadius: 10,
      background: selected ? 'var(--bg-surface)' : 'transparent',
      border: selected ? '1px solid var(--border-strong)' : '1px solid transparent',
      textAlign: 'left', cursor: 'pointer', width: '100%',
      boxShadow: selected ? 'var(--shadow-sm)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <StatusPill status={status} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{time}</span>
      </div>
      <div style={{
        fontSize: 13, fontWeight: selected ? 500 : 400, lineHeight: 1.5,
        letterSpacing: '-0.01em', color: 'var(--text-primary)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {question}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{route}</span>
        {tools.map(t => (
          <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{t}</span>
        ))}
      </div>
    </button>
  );
}

function Tab({ icon, label, active }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      marginBottom: -1,
    }}>
      {icon}{label}
    </button>
  );
}

function MiniStat({ icon, label, value, sub }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function ToolBadge({ children }) {
  return (
    <span style={{
      fontSize: 12, fontFamily: 'ui-monospace, monospace',
      padding: '4px 10px', borderRadius: 6,
      background: 'var(--bg-subtle)', border: '1px solid var(--border)',
      color: 'var(--text-secondary)',
    }}>
      {children}
    </span>
  );
}

function RowKV({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontFamily: k === 'Run ID' ? 'ui-monospace, monospace' : 'inherit' }}>{v}</span>
    </div>
  );
}

function TimelineStep({ time, type, title, detail, last }) {
  const icons = {
    route: <IconWorkflow size={12} />,
    vector: <IconSearch size={12} />,
    graph: <IconNetwork size={12} />,
    tool: <IconBot size={12} />,
    answer: <IconCheck size={12} />,
  };
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icons[type]}
        </div>
        {!last && <div style={{ position: 'absolute', left: 11, top: 26, bottom: -14, width: 1, background: 'var(--border)' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}>{time}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{detail}</div>
      </div>
    </div>
  );
}

Object.assign(window, { AdminTraceScreen });
