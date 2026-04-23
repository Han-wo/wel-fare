/* Sidebar + Chat index (empty chat landing with starter prompts) */

function Sidebar({ activeKey = 'chat', collapsed = false }) {
  const sessions = [
    { id: '1', title: '청년 월세 지원 서울 기준', when: '오늘' },
    { id: '2', title: '무주택 1인가구 주거 지원', when: '어제' },
    { id: '3', title: '부모님 돌봄 서비스', when: '3일 전' },
    { id: '4', title: '기초수급자 생활비 지원 정리', when: '지난주' },
    { id: '5', title: '프리랜서 국민연금 감면', when: '지난주' },
  ];

  return (
    <aside style={{
      width: collapsed ? 60 : 260, flexShrink: 0, height: '100%',
      background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Brand */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
      }}>
        {!collapsed && (
          <div className="brand-lockup">
            <span className="brand-mark">W</span>
            welFareAI
          </div>
        )}
        <button className="btn-ghost" style={{ padding: 6 }}>
          <IconPanelLeft size={16} />
        </button>
      </div>

      {/* New chat */}
      <div style={{ padding: 12 }}>
        <button className="btn-primary" style={{ width: '100%', justifyContent: 'flex-start' }}>
          <IconPlus size={14} /> 새 질문
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input className="input" placeholder="대화 검색..." style={{
            paddingLeft: 30, fontSize: 13, height: 34, background: 'transparent',
          }} />
        </div>
      </div>

      {/* Sessions */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
        <p style={{
          fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
          padding: '6px 8px', margin: 0, letterSpacing: '0.04em',
        }}>최근 대화</p>
        {sessions.map((s, i) => (
          <button key={s.id} style={{
            width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '8px 10px', borderRadius: 8, border: 'none',
            background: i === 0 ? 'var(--bg-hover)' : 'transparent',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
            marginBottom: 2,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 13, fontWeight: i === 0 ? 500 : 400,
                color: 'var(--text-primary)', margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}>{s.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{s.when}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
        {[
          { key: 'chat', icon: IconMessage, label: '복지 찾기' },
          { key: 'profile', icon: IconUser, label: '내 프로필' },
          { key: 'bookmark', icon: IconBookmark, label: '북마크' },
        ].map(({ key, icon: I, label }) => (
          <button key={key} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8, border: 'none',
            background: activeKey === key ? 'var(--accent-soft)' : 'transparent',
            color: activeKey === key ? 'var(--accent-text)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)',
            fontWeight: activeKey === key ? 500 : 400, marginBottom: 2,
          }}>
            <I size={15} /> {label}
          </button>
        ))}

        <div style={{
          marginTop: 8, padding: '10px 10px 10px 10px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 999,
            background: '#c8d8d0', color: '#2d4a3a',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 12,
          }}>홍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>홍길동</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>서울 · 1인 가구</p>
          </div>
          <button className="btn-ghost" style={{ padding: 6 }} title="로그아웃">
            <IconLogout size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ChatIndexScreen() {
  const starters = [
    { title: '주거 지원', body: '내 조건에서 지금 신청 가능한 주거 지원 찾아줘' },
    { title: '마감 임박', body: '청년 정책 중 마감 임박한 것만 보여줘' },
    { title: '돌봄 · 복지시설', body: '부모님 근처 복지시설과 돌봄 지원 같이 알려줘' },
    { title: '생활비 지원', body: '저소득층 생활비 지원이 있는지 정리해줘' },
  ];

  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="chat" />

      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-canvas)', overflow: 'auto',
      }}>
        {/* Top bar */}
        <header style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'var(--text-secondary)' }}>
            새 대화
          </h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-ghost">
              <IconBookmark size={14} />
            </button>
          </div>
        </header>

        {/* Center content */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', padding: '48px 32px',
        }}>
          <div style={{ maxWidth: 680, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <span className="brand-mark" style={{ width: 48, height: 48, borderRadius: 12, fontSize: 28, marginBottom: 16 }}>W</span>
              <h1 style={{
                fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em',
                margin: '16px 0 8px', color: 'var(--text-primary)',
              }}>
                안녕하세요, 홍길동님
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
                어떤 복지 제도를 찾아볼까요?
              </p>
            </div>

            {/* Composer */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 14, boxShadow: 'var(--shadow-md)',
            }}>
              <textarea placeholder="질문을 입력하세요..." style={{
                width: '100%', border: 'none', outline: 'none', resize: 'none',
                fontFamily: 'var(--font)', fontSize: 15, lineHeight: 1.6,
                color: 'var(--text-primary)', background: 'transparent',
                minHeight: 48, padding: '6px 4px',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost" style={{ fontSize: 12 }}>
                    <IconMapPin size={13} /> 서울
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 12 }}>
                    <IconUser size={13} /> 1인 가구
                  </button>
                </div>
                <button className="btn-primary" style={{ padding: '8px 10px' }} aria-label="전송">
                  <IconArrowUp size={14} />
                </button>
              </div>
            </div>

            {/* Starters */}
            <div style={{ marginTop: 28 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.04em' }}>
                추천 질문
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {starters.map(s => (
                  <button key={s.title} style={{
                    padding: 14, borderRadius: 12, textAlign: 'left',
                    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'all 0.15s ease',
                  }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-text)', margin: 0, letterSpacing: '-0.01em' }}>
                      {s.title}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: '4px 0 0', lineHeight: 1.5, letterSpacing: '-0.01em' }}>
                      {s.body}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.Sidebar = Sidebar;
window.ChatIndexScreen = ChatIndexScreen;
