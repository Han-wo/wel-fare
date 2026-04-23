// Chat landing (no active session yet) — Claude-style minimal hero.

function ChatStartScreen() {
  const quick = [
    { k: '바로 시작', q: '내 조건에서 지금 신청 가능한 주거 지원 찾아줘' },
    { k: '바로 시작', q: '청년 정책 중 마감 임박한 것만 보여줘' },
    { k: '바로 시작', q: '부모님 근처 복지시설과 돌봄 지원 같이 찾아줘' },
    { k: '바로 시작', q: '저소득 생활비 지원이 있는지 정리해줘' },
  ];

  return (
    <Frame>
      <div style={{ display: 'flex', height: '100%' }}>
        <Sidebar active="chat" />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* top bar */}
          <div
            style={{
              height: 52,
              borderBottom: `1px solid ${TOKENS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              background: TOKENS.bgElevated,
            }}
          >
            <div style={{ fontSize: 13, color: TOKENS.textMuted }}>복지 찾기</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.textMuted }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: TOKENS.success, display: 'inline-block' }} />
              최신 데이터 · 2025.10 기준
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 32px',
            }}
          >
            <div style={{ maxWidth: 680, width: '100%' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: TOKENS.accent,
                  color: '#FCFBF7',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  margin: '0 auto 20px',
                  letterSpacing: '-0.02em',
                }}
              >
                w
              </div>

              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  letterSpacing: '-0.025em',
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                지금 필요한 지원을 물어보세요
              </h1>
              <p
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: TOKENS.textSecondary,
                  textAlign: 'center',
                }}
              >
                대상 조건, 마감 여부, 공식 신청 경로까지 한 번에 정리해드려요.
              </p>

              {/* Input */}
              <div
                style={{
                  marginTop: 28,
                  background: TOKENS.panel,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: '0 1px 2px rgba(20,20,20,0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    color: TOKENS.textMuted,
                    padding: '6px 4px 14px',
                    minHeight: 44,
                  }}
                >
                  예: 경기도 청년이 지금 신청 가능한 주거 지원 알려줘
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: `1px solid ${TOKENS.border}`,
                    paddingTop: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Chip>서울 · 1인 가구</Chip>
                    <Chip>내 프로필 사용 중</Chip>
                  </div>
                  <button
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: TOKENS.accent,
                      color: '#fff',
                      border: 'none',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <ArrowUpIcon size={14} />
                  </button>
                </div>
              </div>

              {/* Quick starts */}
              <div style={{ marginTop: 26 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 4px 10px',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSecondary }}>
                    지금 많이 찾는 질문
                  </div>
                  <div style={{ fontSize: 11, color: TOKENS.textMuted }}>클릭하면 바로 시작</div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                  }}
                >
                  {quick.map((q) => (
                    <div
                      key={q.q}
                      style={{
                        background: TOKENS.bgElevated,
                        border: `1px solid ${TOKENS.border}`,
                        borderRadius: 10,
                        padding: 14,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: TOKENS.textMuted,
                          letterSpacing: '0.06em',
                          marginBottom: 6,
                        }}
                      >
                        {q.k.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.5, color: TOKENS.textPrimary }}>
                        {q.q}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Frame>
  );
}

function Chip({ children }) {
  return (
    <span
      style={{
        padding: '4px 9px',
        background: TOKENS.bg,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 999,
        fontSize: 11,
        color: TOKENS.textSecondary,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

Object.assign(window, { ChatStartScreen, Chip });
