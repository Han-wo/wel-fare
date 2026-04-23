/* Landing page — Claude-inspired. Hero with clean typography, no floating cards. */
function LandingScreen() {
  const samples = [
    '서울 청년이 지금 신청 가능한 월세 지원만 알려줘',
    '무주택 1인 가구가 바로 볼 수 있는 주거 지원 정리해줘',
    '부모님 근처 복지시설과 돌봄 지원 같이 찾아줘',
  ];

  return (
    <div className="artboard-root" style={{ background: '#f5f3ee', padding: '0' }}>
      {/* Top nav */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 48px', borderBottom: '1px solid var(--border)',
        background: 'rgba(245, 243, 238, 0.8)', backdropFilter: 'blur(8px)',
      }}>
        <div className="brand-lockup">
          <span className="brand-mark">W</span>
          welFareAI
        </div>
        <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <a className="btn-ghost" href="#">소개</a>
          <a className="btn-ghost" href="#">사용 방법</a>
          <a className="btn-ghost" href="#">로그인</a>
          <a className="btn-primary" href="#" style={{ marginLeft: 8 }}>시작하기</a>
        </nav>
      </header>

      {/* Hero */}
      <main style={{ padding: '96px 48px 64px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 999,
            background: 'var(--accent-soft)', color: 'var(--accent-text)',
            fontSize: 12, fontWeight: 500, marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
            복지 정보 AI 컨시어지
          </div>

          <h1 style={{
            fontSize: 64, lineHeight: 1.05, letterSpacing: '-0.035em',
            fontWeight: 600, margin: 0, color: 'var(--text-primary)',
          }}>
            복지 정보를<br/>
            <span style={{ color: 'var(--accent)' }}>가장 빠르게</span> 찾는 방법
          </h1>

          <p style={{
            fontSize: 18, lineHeight: 1.6, color: 'var(--text-secondary)',
            marginTop: 24, maxWidth: 560, letterSpacing: '-0.01em',
          }}>
            지금 필요한 지원을 질문하면, 내 조건에 맞는 제도와 공식 신청 경로만 간단하게 정리해드립니다.
          </p>
        </div>

        {/* Question composer */}
        <div style={{
          marginTop: 40, maxWidth: 720,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 16,
          boxShadow: 'var(--shadow-md)',
        }}>
          <textarea
            defaultValue="경기도 청년이 지금 신청 가능한 주거 지원과 공식 신청 링크만 알려줘"
            style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'var(--font)', fontSize: 16, lineHeight: 1.6,
              color: 'var(--text-primary)', background: 'transparent',
              minHeight: 72, padding: '8px 4px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <IconSparkles size={14} />
              <span>AI가 공식 출처만 참고합니다</span>
            </div>
            <button className="btn-primary">
              질문 보내기
              <IconArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Example chips */}
        <div style={{ marginTop: 20, maxWidth: 720 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.04em' }}>
            예시 질문
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {samples.map(s => (
              <button key={s} style={{
                padding: '8px 12px', borderRadius: 999,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Feature grid */}
        <div style={{
          marginTop: 96, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        }}>
          {[
            { title: '공식 출처만', body: '정부24, 복지로, 지자체 공식 사이트에서 확인된 제도만 안내합니다.' },
            { title: '내 조건 기준', body: '거주 지역, 가구 형태, 소득 수준 등을 반영해 실제 받을 수 있는 지원만 필터링합니다.' },
            { title: '신청 경로까지', body: '대상 조건, 마감 여부, 공식 신청 링크를 한 번에 정리해 드립니다.' },
          ].map((f, i) => (
            <div key={i} style={{
              padding: 24, borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, fontFamily: 'Times New Roman, serif', fontWeight: 600,
              }}>{String(i + 1).padStart(2, '0')}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

window.LandingScreen = LandingScreen;
