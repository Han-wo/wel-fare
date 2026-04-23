// Chat session with streaming assistant response — the real workhorse view.

function ChatSessionScreen() {
  return (
    <Frame>
      <div style={{ display: 'flex', height: '100%' }}>
        <Sidebar active="chat" />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: TOKENS.bg }}>
          {/* Session header */}
          <div
            style={{
              height: 56,
              borderBottom: `1px solid ${TOKENS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              background: TOKENS.bgElevated,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
                청년 월세 지원 신청 가능한 것
              </div>
              <div style={{ fontSize: 11, color: TOKENS.textMuted, marginTop: 1 }}>
                방금 · 프로필 적용 중 (서울 · 1인 가구 · 중위소득 60%)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <IconButton><BookmarkIcon /></IconButton>
              <IconButton><RefreshIcon /></IconButton>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 20px' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
              {/* User msg */}
              <div style={{ display: 'flex', gap: 12 }}>
                <Avatar variant="user">김</Avatar>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 4 }}>
                    김민서
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.65, color: TOKENS.textPrimary }}>
                    서울 거주 무주택 청년인데, 지금 신청 가능한 월세 지원만 알려줘.
                    마감 임박한 순서로 정리해주면 좋겠어.
                  </div>
                </div>
              </div>

              {/* Assistant msg */}
              <div style={{ display: 'flex', gap: 12 }}>
                <Avatar variant="brand">w</Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSecondary, marginBottom: 6 }}>
                    welFareAI
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.75, color: TOKENS.textPrimary }}>
                    서울 거주, 무주택, 만 19–39세 기준으로 지금 바로 신청 가능한 월세 지원
                    제도를 <strong style={{ fontWeight: 600 }}>마감 임박 순</strong>으로 정리했어요.
                  </div>

                  {/* Policy cards */}
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <PolicyCard
                      rank={1}
                      tag="마감 5일 전"
                      tagColor={TOKENS.accent}
                      title="서울시 청년 월세 한시 특별지원"
                      meta="서울특별시 · 주거 지원"
                      amount="월 최대 20만원 · 최대 12개월"
                      bullets={[
                        '만 19~39세, 무주택, 기준 중위소득 150% 이하',
                        '부모 소득 무관 · 본인 소득 합산만 판정',
                      ]}
                      match
                    />
                    <PolicyCard
                      rank={2}
                      tag="마감 12일 전"
                      tagColor="#A67A3A"
                      title="청년 주거안정 월세대출"
                      meta="주택도시기금 · 대출 지원"
                      amount="월 40만원 이내 · 연 1.3%"
                      bullets={[
                        '만 19~34세 · 부부합산 연소득 5천만원 이하',
                        '무주택 세대주 (예비 세대주 포함)',
                      ]}
                      match
                    />
                    <PolicyCard
                      rank={3}
                      tag="상시 접수"
                      tagColor={TOKENS.textMuted}
                      title="주거급여 (청년 분리지급)"
                      meta="보건복지부 · 주거급여"
                      amount="지역별 기준임대료 지급"
                      bullets={[
                        '기준 중위소득 47% 이하 가구',
                        '부모와 주민등록상 다른 거주지일 것',
                      ]}
                    />
                  </div>

                  {/* Sources + actions */}
                  <div
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: TOKENS.bgElevated,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, color: TOKENS.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClockIcon /> 8개 출처 · 복지로, 서울주거포털, 주택도시기금 공식 고시
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <SmallBtn><CopyIcon /> 복사</SmallBtn>
                      <SmallBtn><BookmarkIcon /> 저장</SmallBtn>
                      <SmallBtn><RefreshIcon /> 다시</SmallBtn>
                    </div>
                  </div>
                </div>
              </div>

              {/* Follow-ups */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 32 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 8, letterSpacing: '0.04em' }}>
                    이어서 물어볼 수 있어요
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      '신청 서류 체크리스트 만들어줘',
                      '서울시 청년 월세 신청 방법 단계별로',
                      '지금 내 조건으로 중복 수령 가능한지',
                    ].map((t) => (
                      <button
                        key={t}
                        style={{
                          padding: '7px 12px',
                          background: TOKENS.bgElevated,
                          border: `1px solid ${TOKENS.border}`,
                          borderRadius: 999,
                          fontSize: 12,
                          color: TOKENS.textSecondary,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: '12px 32px 20px', borderTop: `1px solid ${TOKENS.border}`, background: TOKENS.bgElevated }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div
                style={{
                  background: TOKENS.panel,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: '0 1px 2px rgba(20,20,20,0.04)',
                }}
              >
                <div style={{ flex: 1, fontSize: 14, color: TOKENS.textMuted }}>
                  이어서 질문하기…
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
              <div style={{ marginTop: 6, fontSize: 11, color: TOKENS.textMuted, textAlign: 'center' }}>
                AI가 제공하는 정보이며 최종 신청 전 공식 페이지를 반드시 확인해주세요.
              </div>
            </div>
          </div>
        </main>
      </div>
    </Frame>
  );
}

function Avatar({ variant = 'user', children }) {
  const styles = {
    user: { background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSecondary },
    brand: { background: TOKENS.accent, color: '#FCFBF7' },
  }[variant];
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
        fontWeight: 600,
        flexShrink: 0,
        ...styles,
      }}
    >
      {children}
    </div>
  );
}

function PolicyCard({ rank, tag, tagColor, title, meta, amount, bullets, match }) {
  return (
    <div
      style={{
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: TOKENS.textMuted,
                letterSpacing: '0.06em',
              }}
            >
              #{rank}
            </span>
            <span
              style={{
                padding: '2px 7px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: tagColor === TOKENS.textMuted ? TOKENS.bg : `${tagColor}18`,
                color: tagColor,
                border: tagColor === TOKENS.textMuted ? `1px solid ${TOKENS.border}` : 'none',
              }}
            >
              {tag}
            </span>
            {match && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: TOKENS.successSoft,
                  color: TOKENS.success,
                }}
              >
                <CheckIcon size={10} /> 내 조건 부합
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontSize: 12, color: TOKENS.textMuted, marginTop: 2 }}>{meta}</div>
        </div>
        <button
          style={{
            padding: '6px 10px',
            background: 'transparent',
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            color: TOKENS.textPrimary,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          신청 <ExternalIcon />
        </button>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 10px',
          background: TOKENS.bg,
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: TOKENS.textPrimary,
        }}
      >
        {amount}
      </div>
      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
        {bullets.map((b) => (
          <li
            key={b}
            style={{
              fontSize: 13,
              color: TOKENS.textSecondary,
              padding: '3px 0 3px 14px',
              position: 'relative',
              lineHeight: 1.55,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 2,
                top: 10,
                width: 4,
                height: 4,
                borderRadius: 999,
                background: TOKENS.textFaint,
              }}
            />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmallBtn({ children }) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 9px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        color: TOKENS.textMuted,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

Object.assign(window, { ChatSessionScreen, Avatar, PolicyCard, SmallBtn });
