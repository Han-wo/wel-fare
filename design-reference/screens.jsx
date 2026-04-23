// Shared design tokens + small primitives used by every screen.
// Claude-inspired: warm ivory, muted clay accent, small radii, flat surfaces.

const TOKENS = {
  bg: '#F7F5F0',
  bgElevated: '#FCFBF7',
  panel: '#FFFFFF',
  textPrimary: '#1F1E1C',
  textSecondary: '#4B4A47',
  textMuted: '#8A8883',
  textFaint: '#B5B1A8',
  border: '#E8E4DB',
  borderStrong: '#D9D4C7',
  accent: '#C96442',
  accentHover: '#B5573A',
  accentSoft: '#F4E8E1',
  accentFaint: '#FAF2EC',
  success: '#4B7A4A',
  successSoft: '#EAF0E6',
  danger: '#B55843',
};

// Wraps each screen in a proper on-brand backdrop with KR typography.
function Frame({ width = 1200, height = 820, bg = TOKENS.bg, children, style }) {
  return (
    <div
      style={{
        width,
        height,
        background: bg,
        color: TOKENS.textPrimary,
        fontFamily:
          "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif",
        fontSize: 14,
        lineHeight: 1.55,
        letterSpacing: '-0.005em',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Left navigation, shared across all app screens.
function Sidebar({ active = 'chat', collapsed = false } = {}) {
  const w = collapsed ? 68 : 256;
  const items = [
    { id: 'chat', label: '복지 찾기', icon: ChatIcon },
    { id: 'profile', label: '내 프로필', icon: UserIcon },
  ];
  const sessions = [
    { id: 's1', title: '청년 월세 지원 신청 가능한 것', time: '방금' },
    { id: 's2', title: '무주택 1인 가구 주거 지원 정리', time: '2시간 전' },
    { id: 's3', title: '부모님 근처 복지시설 돌봄', time: '어제' },
    { id: 's4', title: '저소득 생활비 지원 정리', time: '3일 전' },
    { id: 's5', title: '마감 임박 청년 정책', time: '5일 전' },
  ];

  return (
    <aside
      style={{
        width: w,
        borderRight: `1px solid ${TOKENS.border}`,
        background: TOKENS.bgElevated,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Brand + collapse */}
      <div
        style={{
          padding: collapsed ? '16px 10px' : '16px',
          borderBottom: `1px solid ${TOKENS.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}
      >
        {!collapsed ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BrandMark size={28} />
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                welFare<span style={{ color: TOKENS.accent }}>AI</span>
              </div>
            </div>
            <IconButton><ChevronsLeftIcon /></IconButton>
          </>
        ) : (
          <BrandMark size={28} />
        )}
      </div>

      {/* New chat */}
      <div style={{ padding: collapsed ? '12px 10px' : 12 }}>
        <button
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 8,
            padding: collapsed ? '9px 0' : '9px 12px',
            background: TOKENS.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <PlusIcon />
          {!collapsed && '새 질문'}
        </button>
      </div>

      {/* Sessions */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: TOKENS.textMuted,
              padding: '8px 8px 6px',
              letterSpacing: '0.04em',
            }}
          >
            현재 대화
          </div>
          <SessionItem
            title={sessions[0].title}
            time={sessions[0].time}
            active={active === 'chat'}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: TOKENS.textMuted,
              padding: '16px 8px 6px',
              letterSpacing: '0.04em',
            }}
          >
            저장된 대화
          </div>
          {sessions.slice(1).map((s) => (
            <SessionItem key={s.id} title={s.title} time={s.time} />
          ))}
        </div>
      )}
      {collapsed && <div style={{ flex: 1 }} />}

      {/* Nav bottom */}
      <div
        style={{
          borderTop: `1px solid ${TOKENS.border}`,
          padding: collapsed ? '8px' : '10px 10px 12px',
        }}
      >
        {items.map((it) => {
          const on = active === it.id;
          return (
            <div
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                padding: collapsed ? '10px 0' : '9px 10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                color: on ? TOKENS.textPrimary : TOKENS.textSecondary,
                background: on ? TOKENS.accentFaint : 'transparent',
                marginBottom: 2,
              }}
            >
              <it.icon />
              {!collapsed && it.label}
            </div>
          );
        })}
        {!collapsed && (
          <div
            style={{
              marginTop: 6,
              paddingTop: 10,
              borderTop: `1px solid ${TOKENS.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 8px 2px',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: TOKENS.accentSoft,
                color: TOKENS.accent,
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              김
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>김민서</div>
              <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
                서울 · 1인 가구
              </div>
            </div>
            <IconButton><LogOutIcon /></IconButton>
          </div>
        )}
      </div>
    </aside>
  );
}

function SessionItem({ title, time, active = false }) {
  return (
    <div
      style={{
        padding: '9px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? TOKENS.accentFaint : 'transparent',
        marginBottom: 1,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: TOKENS.textPrimary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: TOKENS.textMuted, marginTop: 2 }}>{time}</div>
    </div>
  );
}

function BrandMark({ size = 32 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: TOKENS.accent,
        color: '#FCFBF7',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.46,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      }}
    >
      w
    </div>
  );
}

function IconButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        background: 'transparent',
        border: 'none',
        color: TOKENS.textMuted,
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// --- Icons (stroke) ------------------------------------------------------
const svg = (d, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ChatIcon = () => svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const UserIcon = () => svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
const PlusIcon = () => svg(<><path d="M12 5v14M5 12h14" /></>, 14);
const ChevronsLeftIcon = () => svg(<><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></>, 14);
const LogOutIcon = () => svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>, 14);
const ArrowRightIcon = ({ size = 16 }) => svg(<><path d="M5 12h14M13 5l7 7-7 7" /></>, size);
const ArrowUpIcon = ({ size = 16 }) => svg(<><path d="M12 19V5M5 12l7-7 7 7" /></>, size);
const SearchIcon = () => svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>, 15);
const CheckIcon = ({ size = 14 }) => svg(<path d="M20 6L9 17l-5-5" />, size);
const BookmarkIcon = () => svg(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />, 14);
const CopyIcon = () => svg(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 14);
const RefreshIcon = () => svg(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>, 14);
const SparklesIcon = ({ size = 14 }) => svg(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />, size);
const ExternalIcon = () => svg(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></>, 13);
const ClockIcon = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 13);
const EyeIcon = () => svg(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, 15);

// Export shared primitives to window for other script files.
Object.assign(window, {
  TOKENS,
  Frame,
  Sidebar,
  SessionItem,
  BrandMark,
  IconButton,
  ChatIcon,
  UserIcon,
  PlusIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  SearchIcon,
  CheckIcon,
  BookmarkIcon,
  CopyIcon,
  RefreshIcon,
  SparklesIcon,
  ExternalIcon,
  ClockIcon,
  EyeIcon,
});
