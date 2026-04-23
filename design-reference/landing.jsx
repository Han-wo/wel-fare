// Landing page — Claude-style: single-column, centered, generous whitespace.
// No floating cards, no glow. One accent color, tight type hierarchy.

function LandingScreen() {
  const samples = [
    '서울 청년이 지금 신청 가능한 월세 지원만 알려줘',
    '무주택 1인 가구가 볼 수 있는 주거 지원 정리해줘',
    '부모님 근처 복지시설과 돌봄 지원 같이 찾아줘',
    '마감 임박한 청년 정책만 모아서 보여줘',
  ];

  return (
    <Frame width={1200} height={820}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top nav */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 40px',
            borderBottom: `1px solid ${TOKENS.border}`,
            background: TOKENS.bgElevated,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={28} />
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
              welFare<span style={{ color: TOKENS.accent }}>AI</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                color: TOKENS.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              로그인
            </button>
            <button
              style={{
                padding: '8px 14px',
                background: TOKENS.textPrimary,
                color: '#FCFBF7',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              시작하기
            </button>
          </div>
        </header>

        {/* Hero */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 40px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 999,
              background: TOKENS.accentFaint,
              color: TOKENS.accent,
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 28,
            }}
          >
            <SparklesIcon size={12} /> AI 복지 컨시어지
          </div>

          <h1
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.035em',
              textAlign: 'center',
              margin: 0,
              maxWidth: 780,
            }}
          >
            복지 정보를 찾는
            <br />
            가장 빠른 방법
          </h1>

          <p
            style={{
              marginTop: 18,
              fontSize: 16,
              lineHeight: 1.65,
              color: TOKENS.textSecondary,
              textAlign: 'center',
              maxWidth: 560,
            }}
          >
            지금 필요한 지원을 질문하면 신청 가능한 제도와
            <br />
            공식 신청 경로만 간단히 정리해드립니다.
          </p>

          {/* Search */}
          <div
            style={{
              marginTop: 36,
              width: '100%',
              maxWidth: 640,
              background: TOKENS.panel,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 14,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 1px 2px rgba(20, 20, 20, 0.04)',
            }}
          >
            <SearchIcon />
            <div
              style={{
                flex: 1,
                fontSize: 15,
                color: TOKENS.textMuted,
              }}
            >
              어떤 지원을 찾고 계신가요?
            </div>
            <button
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: TOKENS.accent,
                color: '#fff',
                border: 'none',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <ArrowUpIcon size={15} />
            </button>
          </div>

          {/* Sample chips */}
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              maxWidth: 780,
            }}
          >
            {samples.map((s) => (
              <button
                key={s}
                style={{
                  padding: '7px 13px',
                  background: TOKENS.bgElevated,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 999,
                  fontSize: 13,
                  color: TOKENS.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </main>

        {/* Footer meta */}
        <footer
          style={{
            padding: '20px 40px',
            borderTop: `1px solid ${TOKENS.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: TOKENS.textMuted,
            fontSize: 12,
          }}
        >
          <div>© 2025 welFareAI</div>
          <div style={{ display: 'flex', gap: 18 }}>
            <span>이용약관</span>
            <span>개인정보처리방침</span>
            <span>문의</span>
          </div>
        </footer>
      </div>
    </Frame>
  );
}

Object.assign(window, { LandingScreen });
