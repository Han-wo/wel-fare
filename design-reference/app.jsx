/* Mount design canvas with all artboards */

const { DesignCanvas, DCSection, DCArtboard } = window;

function App() {
  return (
    <DesignCanvas>
      <DCSection id="landing" title="Landing">
        <DCArtboard id="landing-main" label="랜딩 페이지" width={1280} height={1280}>
          <LandingScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="auth" title="Authentication">
        <DCArtboard id="login" label="로그인" width={1100} height={720}>
          <LoginScreen />
        </DCArtboard>
        <DCArtboard id="register" label="회원가입 — Step 2" width={1100} height={820}>
          <RegisterScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="chat" title="Chat">
        <DCArtboard id="chat-index" label="채팅 — 새 대화 시작" width={1280} height={820}>
          <ChatIndexScreen />
        </DCArtboard>
        <DCArtboard id="chat-session" label="채팅 — 진행 중 세션" width={1280} height={900}>
          <ChatSessionScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="profile" title="Profile">
        <DCArtboard id="profile-main" label="프로필 설정" width={1280} height={960}>
          <ProfileScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="policies" title="Policies">
        <DCArtboard id="policies-list" label="정책 목록" width={1280} height={1000}>
          <PoliciesListScreen />
        </DCArtboard>
        <DCArtboard id="policy-detail" label="정책 상세" width={1280} height={1200}>
          <PolicyDetailScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="user-extras" title="Bookmarks & Notifications">
        <DCArtboard id="bookmarks" label="저장한 정책" width={1280} height={900}>
          <BookmarksScreen />
        </DCArtboard>
        <DCArtboard id="notifications" label="알림" width={1280} height={900}>
          <NotificationsScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="admin" title="Admin Console">
        <DCArtboard id="admin-sync" label="관리자 — 동기화 현황" width={1440} height={1100}>
          <AdminSyncScreen />
        </DCArtboard>
        <DCArtboard id="admin-trace" label="관리자 — AI 추적 (개요)" width={1440} height={1100}>
          <AdminTraceScreen />
        </DCArtboard>
        <DCArtboard id="admin-trace-graph" label="관리자 — AI 추적 (그래프)" width={1440} height={1100}>
          <AdminTraceGraphScreen />
        </DCArtboard>
        <DCArtboard id="admin-trace-events" label="관리자 — AI 추적 (이벤트 타임라인)" width={1440} height={1100}>
          <AdminTraceEventsScreen />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.body.appendChild(document.createElement('div')));
root.render(<App />);
