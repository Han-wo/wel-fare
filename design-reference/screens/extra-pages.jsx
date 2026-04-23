/* Policies list, policy detail, bookmarks, notifications */

function PoliciesListScreen() {
  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="policies" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)', overflow: 'hidden' }}>
        <header style={pageStyles.header}>
          <div>
            <h1 style={pageStyles.h1}>복지 정책</h1>
            <p style={pageStyles.sub}>나에게 맞는 정책 382건 · 서울 강동구, 30대, 1인가구 기준</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ height: 36 }}>
              <IconMapPin size={14} /> 지역 필터
            </button>
            <button className="btn-secondary" style={{ height: 36 }}>
              <IconCalendar size={14} /> 기한순
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          {/* Category chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <CategoryChip active>전체 382</CategoryChip>
            <CategoryChip>주거 42</CategoryChip>
            <CategoryChip>일자리 68</CategoryChip>
            <CategoryChip>돌봄 23</CategoryChip>
            <CategoryChip>건강 54</CategoryChip>
            <CategoryChip>금융 38</CategoryChip>
            <CategoryChip>교육 28</CategoryChip>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" placeholder="정책명, 지원내용 검색..." style={{ paddingLeft: 34, height: 40 }} />
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <PolicyListCard title="서울시 청년 매입임대주택" tag="주거" agency="SH공사" deadline="D-8" amount="보증금 100만원" desc="만 19~39세 무주택 청년. 강동구 내 공급물량 2건." new />
            <PolicyListCard title="청년 월세 특별지원" tag="주거" agency="국토교통부" deadline="상시" amount="월 20만원 · 최대 12개월" desc="중위소득 60% 이하. 1인가구 월세 50만원 이하." />
            <PolicyListCard title="서울 안심소득 시범사업" tag="금융" agency="서울시" deadline="D-15" amount="월 최대 91만원" desc="중위소득 85% 이하 가구. 2025년 3차 신청." urgent />
            <PolicyListCard title="국민취업지원제도 Ⅰ유형" tag="일자리" agency="고용노동부" deadline="상시" amount="월 50만원 · 6개월" desc="15~69세 저소득 구직자. 취업활동계획 수립 필수." />
            <PolicyListCard title="1인가구 안심동행서비스" tag="돌봄" agency="서울시" deadline="상시" amount="시간당 5천원" desc="병원 동행·장보기 등. 연 720시간 이내." />
            <PolicyListCard title="청년 마음건강 바우처" tag="건강" agency="보건복지부" deadline="D-23" amount="회당 6~7만원 · 10회" desc="19~34세 청년. 전문 심리상담 지원." />
          </div>
        </div>
      </main>
    </div>
  );
}

function PolicyDetailScreen() {
  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="policies" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)', overflow: 'hidden' }}>
        <header style={pageStyles.header}>
          <button className="btn-ghost" style={{ padding: '6px 10px' }}>
            <IconArrowLeft size={14} /> 목록
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ height: 36 }}>
              <IconBookmark size={14} /> 저장
            </button>
            <button className="btn-primary" style={{ height: 36 }}>
              <IconExternal size={14} /> 공식 신청
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 28px 40px' }}>
            {/* Hero */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <TagPill kind="accent">주거</TagPill>
              <TagPill>SH공사</TagPill>
              <TagPill kind="warning">D-8</TagPill>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.25 }}>
              서울시 청년 매입임대주택<br />2025년 1차 공고
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '14px 0 0', maxWidth: 680 }}>
              무주택 청년을 위해 서울주택도시공사(SH)가 매입한 다세대·다가구 주택을 시세 30% 수준으로 공급하는 임대주택 공고입니다.
            </p>

            {/* Key metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24 }}>
              <KeyMetric label="임대 조건" value="보증금 100만원" sub="월임대료 별도" />
              <KeyMetric label="공급 호수" value="162호" sub="강동구 2건 포함" />
              <KeyMetric label="신청 기한" value="2025.01.22" sub="14일 남음" accent />
            </div>

            {/* Fit card */}
            <div style={{ marginTop: 18, padding: 16, background: 'var(--accent-soft)', border: '1px solid rgba(45,106,95,0.2)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <IconCheck size={14} style={{ color: 'var(--accent-text)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', letterSpacing: '-0.01em' }}>
                  내 조건과 매칭됩니다
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--accent-text)', lineHeight: 1.7, margin: 0 }}>
                30대 · 1인가구 · 서울 강동구 조건으로 자격 요건을 충족합니다. 소득 증빙서류만 준비하시면 됩니다.
              </p>
            </div>

            {/* Sections */}
            <Section title="신청 자격">
              <BulletList items={[
                '만 19세 이상 ~ 39세 이하 청년',
                '공고일 현재 무주택 세대구성원',
                '신청자 본인 월평균소득 100% 이하 (2024년 기준 약 374만원)',
                '총자산 3.45억원 이하 · 자동차 3,708만원 이하',
              ]} />
            </Section>

            <Section title="지원 내용">
              <BulletList items={[
                '임대료: 주변 시세의 약 30% 수준',
                '임대 기간: 최초 2년 · 재계약 시 최대 20년',
                '보증금: 100만원 균일 · 차액은 월임대료 전환 가능',
              ]} />
            </Section>

            <Section title="준비 서류">
              <div style={{ display: 'grid', gap: 6 }}>
                <DocRow name="주민등록등본" required />
                <DocRow name="가족관계증명서" required />
                <DocRow name="소득금액증명원" required />
                <DocRow name="재직증명서 또는 사업자등록증" />
                <DocRow name="통장사본" />
              </div>
            </Section>

            <Section title="출처">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
                서울특별시 주택정책과 · SH공사 공고번호 2025-01-042 · 최종 갱신 2025.01.08
              </p>
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}

function BookmarksScreen() {
  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="bookmarks" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)', overflow: 'hidden' }}>
        <header style={pageStyles.header}>
          <div>
            <h1 style={pageStyles.h1}>저장한 정책</h1>
            <p style={pageStyles.sub}>14건 · 신청 기한 임박순</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ height: 36 }}>
              <IconCalendar size={14} /> 정렬
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          {/* Upcoming deadline strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#f9f0d9', border: '1px solid #e9d7a6', borderRadius: 10, marginBottom: 20 }}>
            <IconBell size={14} style={{ color: '#8a5d10', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#6b4808', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>3건의 정책</strong>이 이번 주 내 마감됩니다. 신청 서류를 준비하세요.
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <BookmarkTab active count={14}>전체</BookmarkTab>
            <BookmarkTab count={8}>신청 전</BookmarkTab>
            <BookmarkTab count={4}>신청 완료</BookmarkTab>
            <BookmarkTab count={2}>마감</BookmarkTab>
          </div>

          {/* List */}
          <div style={{ display: 'grid', gap: 8 }}>
            <BookmarkRow title="서울시 청년 매입임대주택" tag="주거" agency="SH공사" deadline="D-8" amount="보증금 100만원" savedAt="2일 전" status="urgent" />
            <BookmarkRow title="서울 안심소득 시범사업" tag="금융" agency="서울시" deadline="D-15" amount="월 최대 91만원" savedAt="5일 전" status="urgent" />
            <BookmarkRow title="청년 마음건강 바우처" tag="건강" agency="보건복지부" deadline="D-23" amount="회당 6~7만원" savedAt="1주 전" />
            <BookmarkRow title="국민취업지원제도 Ⅰ유형" tag="일자리" agency="고용노동부" deadline="상시" amount="월 50만원" savedAt="2주 전" />
            <BookmarkRow title="청년 월세 특별지원" tag="주거" agency="국토교통부" deadline="상시" amount="월 20만원" savedAt="3주 전" applied />
            <BookmarkRow title="1인가구 안심동행서비스" tag="돌봄" agency="서울시" deadline="상시" amount="시간당 5천원" savedAt="1개월 전" applied />
          </div>
        </div>
      </main>
    </div>
  );
}

function NotificationsScreen() {
  return (
    <div className="artboard-root" style={{ display: 'flex' }}>
      <Sidebar activeKey="notifications" />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)', overflow: 'hidden' }}>
        <header style={pageStyles.header}>
          <div>
            <h1 style={pageStyles.h1}>알림</h1>
            <p style={pageStyles.sub}>읽지 않음 4건 · 최근 30일</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost">모두 읽음 처리</button>
            <button className="btn-secondary" style={{ height: 36 }}>
              <IconSettings size={14} /> 설정
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <BookmarkTab active count={12}>전체</BookmarkTab>
            <BookmarkTab count={4}>읽지 않음</BookmarkTab>
            <BookmarkTab count={6}>기한 임박</BookmarkTab>
            <BookmarkTab count={2}>신규 매칭</BookmarkTab>
          </div>

          {/* Groups */}
          <div style={{ marginBottom: 24 }}>
            <GroupLabel>오늘</GroupLabel>
            <div style={{ display: 'grid', gap: 6 }}>
              <NotifRow unread type="deadline" title="서울시 청년 매입임대주택 마감 8일 전" detail="저장한 정책의 신청 기한이 임박했습니다. 필수 서류를 확인하세요." time="2시간 전" />
              <NotifRow unread type="match" title="새로 매칭된 정책 2건" detail="프로필 업데이트로 '청년 마음건강 바우처' 외 1건이 추가로 매칭되었습니다." time="4시간 전" />
              <NotifRow unread type="info" title="프로필 정보 확인 요청" detail="소득 정보를 업데이트하면 더 정확한 추천을 받을 수 있습니다." time="6시간 전" />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <GroupLabel>이번 주</GroupLabel>
            <div style={{ display: 'grid', gap: 6 }}>
              <NotifRow unread type="deadline" title="서울 안심소득 시범사업 마감 15일 전" detail="3차 신청 기간 중입니다." time="어제" />
              <NotifRow type="update" title="청년 월세 특별지원 상세정보 변경" detail="소득 기준이 중위소득 70%로 완화되었습니다." time="3일 전" />
              <NotifRow type="system" title="신규 데이터 소스 추가" detail="지자체 복지정책 2,412건이 새로 수집되었습니다." time="5일 전" />
            </div>
          </div>

          <div>
            <GroupLabel>이전</GroupLabel>
            <div style={{ display: 'grid', gap: 6 }}>
              <NotifRow type="match" title="새로 매칭된 정책 1건" detail="'서울 안심소득 시범사업'이 매칭되었습니다." time="1주 전" />
              <NotifRow type="info" title="welFareAI 개인정보처리방침 개정 안내" detail="2025년 1월 1일부로 개정된 방침이 적용됩니다." time="2주 전" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Pieces ---------- */

const pageStyles = {
  header: { padding: '16px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-canvas)' },
  h1: { fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' },
};

function CategoryChip({ children, active }) {
  return (
    <button style={{
      fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 999,
      background: active ? 'var(--accent)' : 'var(--bg-surface)',
      color: active ? '#fff' : 'var(--text-secondary)',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
      cursor: 'pointer', letterSpacing: '-0.01em',
    }}>
      {children}
    </button>
  );
}

function TagPill({ children, kind }) {
  const styles = {
    accent:  { bg: 'var(--accent-soft)', color: 'var(--accent-text)' },
    warning: { bg: '#f9f0d9', color: '#8a5d10' },
    danger:  { bg: '#f6e2de', color: 'var(--danger)' },
    default: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  };
  const s = styles[kind] || styles.default;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
      background: s.bg, color: s.color, letterSpacing: '-0.005em',
      display: 'inline-flex', alignItems: 'center', lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

function PolicyListCard({ title, tag, agency, deadline, amount, desc, urgent, new: isNew }) {
  const deadlineKind = urgent ? 'danger' : deadline.startsWith('D') ? 'warning' : 'default';
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <TagPill kind="accent">{tag}</TagPill>
          <TagPill>{agency}</TagPill>
          <TagPill kind={deadlineKind}>{deadline}</TagPill>
          {isNew && <TagPill kind="accent">NEW</TagPill>}
        </div>
        <button className="btn-ghost" style={{ padding: 6 }}>
          <IconBookmark size={14} />
        </button>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', margin: '12px 0 6px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-text)', letterSpacing: '-0.01em' }}>{amount}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>자세히 보기 →</span>
      </div>
    </div>
  );
}

function KeyMetric({ label, value, sub, accent }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 6, color: accent ? 'var(--accent-text)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--accent)', marginTop: 8, flexShrink: 0, width: 4, height: 4, borderRadius: 999, background: 'var(--accent)', display: 'inline-block' }} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function DocRow({ name, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <IconFileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, flex: 1, letterSpacing: '-0.01em' }}>{name}</span>
      {required && <TagPill kind="warning">필수</TagPill>}
    </div>
  );
}

function BookmarkTab({ children, active, count }) {
  return (
    <button style={{
      padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 999, background: active ? 'var(--accent-soft)' : 'var(--bg-hover)', color: active ? 'var(--accent-text)' : 'var(--text-muted)' }}>{count}</span>
    </button>
  );
}

function BookmarkRow({ title, tag, agency, deadline, amount, savedAt, status, applied }) {
  const deadlineKind = status === 'urgent' ? 'danger' : deadline.startsWith('D') ? 'warning' : 'default';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <TagPill kind="accent">{tag}</TagPill>
          <TagPill>{agency}</TagPill>
          <TagPill kind={deadlineKind}>{deadline}</TagPill>
          {applied && <TagPill kind="accent"><IconCheck size={10} style={{ marginRight: 3 }} />신청 완료</TagPill>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-text)' }}>{amount}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>저장 {savedAt}</div>
      </div>
      <button className="btn-ghost" style={{ padding: 6 }}>
        <IconMore size={14} />
      </button>
    </div>
  );
}

function GroupLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{children}</div>
  );
}

function NotifRow({ unread, type, title, detail, time }) {
  const iconMap = {
    deadline: { icon: <IconClock size={14} />, color: '#8a5d10', bg: '#f9f0d9' },
    match:    { icon: <IconSparkles size={14} />, color: 'var(--accent-text)', bg: 'var(--accent-soft)' },
    info:     { icon: <IconBell size={14} />, color: 'var(--text-secondary)', bg: 'var(--bg-hover)' },
    update:   { icon: <IconRefresh size={14} />, color: 'var(--accent-text)', bg: 'var(--accent-soft)' },
    system:   { icon: <IconSettings size={14} />, color: 'var(--text-secondary)', bg: 'var(--bg-hover)' },
  };
  const t = iconMap[type];
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      background: unread ? 'var(--bg-surface)' : 'transparent',
      border: '1px solid var(--border)', borderRadius: 10,
      position: 'relative',
    }}>
      {unread && <span style={{ position: 'absolute', left: -4, top: 20, width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />}
      <div style={{ width: 32, height: 32, borderRadius: 8, background: t.bg, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {t.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: unread ? 600 : 500, letterSpacing: '-0.01em' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{time}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '4px 0 0' }}>{detail}</p>
      </div>
    </div>
  );
}

Object.assign(window, { PoliciesListScreen, PolicyDetailScreen, BookmarksScreen, NotificationsScreen });
