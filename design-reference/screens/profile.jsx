/* Profile settings page */

function ProfileScreen() {
  const Section = ({ title, desc, children }) => (
    <section style={{
      padding: '24px 0', borderBottom: '1px solid var(--border)',
      display: 'grid', gridTemplateColumns: '240px 1fr', gap: 32,
    }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h3>
        {desc && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{desc}</p>}
      </div>
      <div>{children}</div>
    </section>
  );

  const Check = ({ label, checked }) => (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8,
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
      fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)',
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        background: checked ? 'var(--accent)' : 'var(--bg-surface)',
        border: '1px solid ' + (checked ? 'var(--accent)' : 'var(--border-strong)'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
      }}>
        {checked && <IconCheck size={10} strokeWidth={3} />}
      </span>
      {label}
    </label>
  );

  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="profile" />

      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-canvas)' }}>
        <header style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-canvas)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'var(--text-secondary)' }}>
            프로필
          </h2>
        </header>

        <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 32px 64px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: '#c8d8d0', color: '#2d4a3a',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 24, letterSpacing: '-0.02em',
            }}>홍</div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>홍길동</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                hong@example.com · 2026년 1월부터 사용 중
              </p>
            </div>
            <div style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'var(--success-soft)', color: 'var(--success)',
              fontSize: 12, fontWeight: 500,
            }}>
              <IconCheck size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              프로필 완성
            </div>
          </div>

          <Section title="기본 정보" desc="맞춤 추천의 기준이 되는 정보입니다.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="label">생년월일</label>
                <input className="input" type="date" defaultValue="1995-03-14" />
              </div>
              <div>
                <label className="label">성별</label>
                <select className="input"><option>남성</option></select>
              </div>
            </div>
          </Section>

          <Section title="거주 및 가구" desc="지역별 · 가구별 제도가 필터링됩니다.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">거주 지역</label>
                <select className="input"><option>서울특별시</option></select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="label">가구 형태</label>
                  <select className="input"><option>1인 가구</option></select>
                </div>
                <div>
                  <label className="label">가구원 수</label>
                  <select className="input"><option>1인</option></select>
                </div>
              </div>
            </div>
          </Section>

          <Section title="직업 및 소득" desc="소득 수준은 많은 복지 제도의 선정 기준입니다.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">직업·고용 형태</label>
                <select className="input"><option>직장인 (근로자)</option></select>
              </div>
              <div>
                <label className="label">소득 수준</label>
                <select className="input"><option>중위소득 80% 이하</option></select>
              </div>
            </div>
          </Section>

          <Section title="추가 상황" desc="해당되는 항목을 선택해주세요.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Check label="주택 소유자" />
              <Check label="장애인 등록" />
              <Check label="국가보훈대상자" />
              <Check label="한부모가정" />
              <Check label="자녀 있음 (18세 미만)" checked />
              <Check label="독거 어르신" />
            </div>
          </Section>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 24, gap: 12,
          }}>
            <button style={{
              background: 'transparent', border: 'none',
              color: 'var(--danger)', fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font)', fontWeight: 500,
            }}>
              계정 삭제
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary">취소</button>
              <button className="btn-primary">
                <IconCheck size={14} /> 변경사항 저장
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.ProfileScreen = ProfileScreen;
