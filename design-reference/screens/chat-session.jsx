/* Active chat session with a real assistant response including a policy card */

function PolicyCard({ title, tag, agency, deadline, eligibility, amount }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-subtle)', padding: 16, marginTop: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
              background: 'var(--accent-soft)', color: 'var(--accent-text)',
            }}>{tag}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agency}</span>
          </div>
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h4>
        </div>
        <button className="btn-ghost" style={{ padding: 6 }}>
          <IconBookmark size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginBottom: 2 }}>지원 금액</p>
          <p style={{ fontSize: 13, margin: 0, fontWeight: 500, letterSpacing: '-0.01em' }}>{amount}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginBottom: 2 }}>신청 기한</p>
          <p style={{ fontSize: 13, margin: 0, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--accent)' }}>{deadline}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginBottom: 2 }}>대상</p>
          <p style={{ fontSize: 13, margin: 0, fontWeight: 500, letterSpacing: '-0.01em' }}>{eligibility}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px' }}>
          <IconExternal size={12} /> 공식 신청 페이지
        </button>
        <button className="btn-ghost" style={{ fontSize: 12 }}>
          자세히 보기
        </button>
      </div>
    </div>
  );
}

function ChatSessionScreen() {
  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="chat" />

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-canvas)', overflow: 'hidden',
      }}>
        {/* Top bar */}
        <header style={{
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              fontSize: 14, fontWeight: 500, margin: 0,
              color: 'var(--text-primary)', letterSpacing: '-0.01em',
            }}>
              청년 월세 지원 서울 기준
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>오늘 오후 2:14</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-ghost"><IconBookmark size={14} /></button>
            <button className="btn-ghost"><IconSettings size={14} /></button>
          </div>
        </header>

        {/* Messages */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '24px 0',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* User message */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                background: '#c8d8d0', color: '#2d4a3a',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 12,
              }}>홍</div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>홍길동</p>
                <p style={{ fontSize: 15, margin: '6px 0 0', lineHeight: 1.65, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  서울 청년이 지금 신청 가능한 월세 지원만 알려줘. 무주택이고 1인 가구야.
                </p>
              </div>
            </div>

            {/* Assistant message */}
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="brand-mark" style={{ width: 28, height: 28, fontSize: 16 }}>W</span>
              <div style={{ flex: 1, paddingTop: 4, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>welFareAI</p>
                <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.75, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  <p style={{ margin: '0 0 12px' }}>
                    서울에 거주하는 무주택 1인 청년이 <strong>지금 신청 가능한</strong> 월세 지원 중 조건에 맞는 3가지를 정리해드렸습니다.
                  </p>

                  <PolicyCard
                    tag="주거"
                    title="서울시 청년월세지원"
                    agency="서울특별시"
                    amount="월 20만원 × 최대 12개월"
                    deadline="~ 2026.05.31"
                    eligibility="만 19–39세 · 무주택"
                  />

                  <PolicyCard
                    tag="주거"
                    title="청년 주거급여 분리지급"
                    agency="국토교통부"
                    amount="지역별 차등 (서울 35만원)"
                    deadline="상시 신청"
                    eligibility="중위소득 48% 이하"
                  />

                  <p style={{ margin: '20px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
                    이 외에 자치구별로 별도 운영되는 제도가 2건 있습니다. 구체적인 거주 자치구를 알려주시면 추가로 확인해드릴게요.
                  </p>

                  {/* Message actions */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
                    <button className="btn-ghost" style={{ fontSize: 12 }}>복사</button>
                    <button className="btn-ghost" style={{ fontSize: 12 }}>다시 생성</button>
                    <button className="btn-ghost" style={{ fontSize: 12 }}>공유</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Follow-up */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                background: '#c8d8d0', color: '#2d4a3a',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 12,
              }}>홍</div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>홍길동</p>
                <p style={{ fontSize: 15, margin: '6px 0 0', lineHeight: 1.65, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  관악구야. 자치구 제도도 같이 알려줘.
                </p>
              </div>
            </div>

            {/* Typing */}
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="brand-mark" style={{ width: 28, height: 28, fontSize: 16 }}>W</span>
              <div style={{ flex: 1, paddingTop: 10 }}>
                <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: 999, background: 'var(--text-faint)',
                      opacity: 0.5,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: '12px 24px 20px', background: 'var(--bg-canvas)' }}>
          <div style={{
            maxWidth: 720, margin: '0 auto',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 12, boxShadow: 'var(--shadow)',
          }}>
            <textarea placeholder="답변을 이어서 질문해보세요..." style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'var(--font)', fontSize: 14, lineHeight: 1.6,
              color: 'var(--text-primary)', background: 'transparent',
              minHeight: 28, padding: '2px 4px',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                <span className="kbd">⏎</span> 전송 · <span className="kbd">⇧⏎</span> 줄바꿈
              </div>
              <button className="btn-primary" style={{ padding: '8px 10px' }} aria-label="전송">
                <IconArrowUp size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.ChatSessionScreen = ChatSessionScreen;
window.PolicyCard = PolicyCard;
