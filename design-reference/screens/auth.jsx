/* Login + Register (step 1) side-by-side reference. Two separate screens. */

function LoginScreen() {
  return (
    <div className="artboard-root" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-canvas)',
    }}>
      {/* Left: brand + quote */}
      <div style={{
        background: '#1a1915', color: '#f5f3ee', padding: '48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div className="brand-lockup" style={{ color: '#f5f3ee' }}>
          <span className="brand-mark">W</span>
          welFareAI
        </div>

        <div>
          <p style={{
            fontSize: 28, lineHeight: 1.35, fontWeight: 500, letterSpacing: '-0.02em',
            margin: 0, color: '#f5f3ee',
          }}>
            "복지 정보는 흩어져 있고, 신청 조건은 늘 복잡합니다. 질문 한 번에 필요한 답만 받아보세요."
          </p>
          <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(245,243,238,0.6)' }}>
            welFareAI · AI 복지 컨시어지
          </p>
        </div>
      </div>

      {/* Right: form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0,
          }}>
            다시 오신 것을 환영합니다
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 32 }}>
            계정으로 로그인하여 대화를 이어가세요.
          </p>

          <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">이메일</label>
              <input className="input" type="email" placeholder="you@example.com" defaultValue="hong@example.com" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="label" style={{ marginBottom: 6 }}>비밀번호</label>
                <a href="#" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>비밀번호 찾기</a>
              </div>
              <div style={{ position: 'relative' }}>
                <input className="input" type="password" placeholder="••••••••" defaultValue="password" style={{ paddingRight: 36 }} />
                <button type="button" style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4,
                }}>
                  <IconEye size={16} />
                </button>
              </div>
            </div>

            <button type="button" className="btn-primary" style={{ marginTop: 4, padding: '12px 16px' }}>
              로그인
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', color: 'var(--text-faint)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>또는</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            계정이 없으신가요?{' '}
            <a href="#" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
              무료 회원가입
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function RegisterScreen() {
  const step = 2;
  const steps = ['기본 정보', '개인 정보', '추가 정보'];
  return (
    <div className="artboard-root" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-canvas)',
    }}>
      <div style={{
        background: '#1a1915', color: '#f5f3ee', padding: '48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div className="brand-lockup" style={{ color: '#f5f3ee' }}>
          <span className="brand-mark">W</span>
          welFareAI
        </div>

        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            맞춤 추천을 위해<br/>프로필을 함께 입력해주세요
          </h2>
          <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.7, color: 'rgba(245,243,238,0.7)' }}>
            거주 지역, 가구 형태, 소득 수준을 저장해두면 실제로 신청할 수 있는 지원만 선별해 보여드립니다.
          </p>

          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['3단계 · 약 2분 소요', '언제든지 수정 가능', '공식 출처 기반 추천'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(245,243,238,0.8)' }}>
                <IconCheck size={14} style={{ color: 'var(--accent)' }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, overflow: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Step pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            {steps.map((s, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <React.Fragment key={s}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 999,
                    background: active ? 'var(--accent-soft)' : done ? 'transparent' : 'transparent',
                    color: active ? 'var(--accent-text)' : done ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 500,
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 999,
                      background: active ? 'var(--accent)' : done ? 'var(--text-primary)' : 'var(--border-strong)',
                      color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600,
                    }}>
                      {done ? <IconCheck size={10} strokeWidth={3} /> : n}
                    </span>
                    {s}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ width: 20, height: 1, background: 'var(--border)' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            개인 정보
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 28 }}>
            추천 정확도를 위해 기본 정보를 알려주세요.
          </p>

          <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">생년월일</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <select className="input"><option>1995</option></select>
                <select className="input"><option>03</option></select>
                <select className="input"><option>14</option></select>
              </div>
            </div>

            <div>
              <label className="label">성별</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[{v:'남성', active:true},{v:'여성'},{v:'기타'}].map(o => (
                  <button type="button" key={o.v} style={{
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid ' + (o.active ? 'var(--accent)' : 'var(--border)'),
                    background: o.active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    color: o.active ? 'var(--accent-text)' : 'var(--text-primary)',
                    fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer', fontWeight: o.active ? 500 : 400,
                  }}>{o.v}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">거주 지역</label>
              <select className="input"><option>서울특별시</option></select>
            </div>

            <div>
              <label className="label">가구 형태</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[{v:'1인 가구', active:true},{v:'부부 가구'},{v:'가족 가구'},{v:'한부모 가구'}].map(o => (
                  <button type="button" key={o.v} style={{
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid ' + (o.active ? 'var(--accent)' : 'var(--border)'),
                    background: o.active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    color: o.active ? 'var(--accent-text)' : 'var(--text-primary)',
                    fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer', fontWeight: o.active ? 500 : 400,
                    textAlign: 'left',
                  }}>{o.v}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1, padding: '12px 16px' }}>
                <IconChevronLeft size={14} /> 이전
              </button>
              <button type="button" className="btn-primary" style={{ flex: 1, padding: '12px 16px' }}>
                다음 <IconArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
window.RegisterScreen = RegisterScreen;
