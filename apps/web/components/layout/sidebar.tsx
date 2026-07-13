'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bookmark,
  FileText,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeft,
  Plus,
  Search,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useUserStore } from '../../store/user.store';
import { api, logoutRequest } from '../../lib/api';
import {
  CHAT_SESSIONS_UPDATED,
  emitChatSessionCloseRequested,
  emitChatSessionsUpdated,
} from '../../lib/chat-events';
import { formatRelativeKoreanTime } from '../../lib/datetime';
import { BrandLockup, BrandMark } from '../brand-mark';

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

interface NavItem {
  key: string;
  href: string;
  icon: typeof MessageSquare;
  label: string;
}

const USER_NAV: NavItem[] = [
  { key: 'chat', href: '/chat', icon: MessageSquare, label: '복지 찾기' },
  { key: 'policies', href: '/policies', icon: FileText, label: '정책' },
  { key: 'bookmarks', href: '/bookmarks', icon: Bookmark, label: '저장' },
  { key: 'notifications', href: '/notifications', icon: Bell, label: '알림' },
  { key: 'profile', href: '/profile', icon: User, label: '내 프로필' },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useUserStore((s) => s.accessToken);
  const userRole = useUserStore((s) => s.userRole);
  const userName = useUserStore((s) => s.userName);
  const clearAuth = useUserStore((s) => s.clearAuth);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const refreshSessions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await api<Session[]>('/chat/sessions');
      startTransition(() => setSessions(data));
    } catch {
      // ignore
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void refreshSessions();
    const onUpdate = () => void refreshSessions();
    window.addEventListener(CHAT_SESSIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(CHAT_SESSIONS_UPDATED, onUpdate);
  }, [accessToken, refreshSessions]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const activeSessionId = useMemo(() => {
    if (!pathname.startsWith('/chat/')) return null;
    return pathname.split('/')[2] ?? null;
  }, [pathname]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || '새 대화').toLowerCase().includes(q));
  }, [sessions, query]);

  const deleteSession = useCallback(
    async (event: React.MouseEvent, sessionId: string, title: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm(`"${title || '새 대화'}" 대화를 삭제하시겠습니까?`)) return;
      try {
        await api(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
        startTransition(() => setSessions((prev) => prev.filter((s) => s.id !== sessionId)));
        emitChatSessionsUpdated();
        if (pathname === `/chat/${sessionId}`) router.push('/chat');
      } catch {
        // ignore
      }
    },
    [pathname, router],
  );

  const newChat = useCallback(async () => {
    try {
      if (activeSessionId) {
        const confirmed = window.confirm('진행 중인 대화를 종료하고 새 질문을 시작하시겠습니까?');
        if (!confirmed) return;
        emitChatSessionCloseRequested(activeSessionId);
        await api(`/chat/sessions/${activeSessionId}/close`, { method: 'POST' });
      }
      const session = await api<{ id: string; title: string }>('/chat/sessions', {
        method: 'POST',
        body: { title: '새 대화' },
      });
      emitChatSessionsUpdated();
      setMobileOpen(false);
      router.push(`/chat/${session.id}`);
    } catch {
      router.push('/chat');
    }
  }, [activeSessionId, router]);

  const handleLogout = useCallback(async () => {
    await logoutRequest();
    clearAuth();
    router.push('/');
  }, [clearAuth, router]);

  const navItems = useMemo(
    () =>
      userRole === 'ADMIN'
        ? [...USER_NAV, { key: 'admin', href: '/admin', icon: Shield, label: '관리 콘솔' }]
        : USER_NAV,
    [userRole],
  );

  const mobileNavItems = useMemo(() => navItems.filter((item) => item.key !== 'admin'), [navItems]);

  const activeNavKey = useMemo(() => {
    const item = navItems.find((n) => pathname.startsWith(n.href));
    return item?.key ?? 'chat';
  }, [navItems, pathname]);

  const initial = (userName ?? '사').charAt(0);
  const roleLabel = userRole === 'ADMIN' ? '관리자' : '일반 회원';

  const renderSessionList = (compactDelete = false) => (
    <>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-muted)',
          padding: '6px 8px',
          margin: 0,
          letterSpacing: '0.04em',
        }}
      >
        최근 대화
      </p>
      {filteredSessions.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '20px 10px',
            textAlign: 'center',
          }}
        >
          {query ? (
            <Search size={16} style={{ color: 'var(--text-faint)' }} />
          ) : (
            <MessageSquare size={16} style={{ color: 'var(--text-faint)' }} />
          )}
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {query
              ? '검색 결과가 없습니다.'
              : '아직 대화가 없습니다. 새 질문으로 시작해보세요.'}
          </p>
        </div>
      ) : (
        filteredSessions.slice(0, 40).map((s) => {
          const active = s.id === activeSessionId;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/chat/${s.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(`/chat/${s.id}`);
                }
              }}
              className="group"
              onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = 'transparent';
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: active ? 'var(--bg-hover)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font)',
                transition: 'background 0.15s ease',
                marginBottom: 2,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    color: 'var(--text-primary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {s.title || '새 대화'}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    margin: '2px 0 0',
                  }}
                >
                  {formatRelativeKoreanTime(s.updatedAt)}
                </p>
              </div>
              <button
                onClick={(event) => void deleteSession(event, s.id, s.title)}
                type="button"
                aria-label={`"${s.title || '새 대화'}" 삭제`}
                className="btn-ghost opacity-0 group-hover:opacity-100"
                style={{ padding: compactDelete ? 2 : 4 }}
              >
                <Trash2 size={compactDelete ? 11 : 12} />
              </button>
            </div>
          );
        })
      )}
    </>
  );

  const renderDesktopSidebar = () => (
    <aside
      className="desktop-only"
      style={{
        width: collapsed ? 60 : 260,
        flexShrink: 0,
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {!collapsed ? (
          <Link href="/chat" style={{ textDecoration: 'none' }}>
            <BrandLockup />
          </Link>
        ) : (
          <BrandMark />
        )}
        {!collapsed && (
          <button
            className="btn-ghost"
            style={{ padding: 6 }}
            onClick={() => setCollapsed(true)}
            aria-label="사이드바 접기"
          >
            <PanelLeft size={16} />
          </button>
        )}
      </div>

      {collapsed ? (
        <div style={{ padding: 8, display: 'grid', gap: 4 }}>
          <button
            onClick={() => setCollapsed(false)}
            className="btn-ghost"
            style={{ padding: 8, width: '100%', justifyContent: 'center' }}
            aria-label="사이드바 펼치기"
          >
            <PanelLeft size={16} />
          </button>
          <button
            onClick={() => void newChat()}
            className="btn-primary"
            style={{ padding: 8, width: '100%', justifyContent: 'center' }}
            aria-label="새 질문"
          >
            <Plus size={14} />
          </button>
          <div style={{ flex: 1 }} />
          {navItems.map(({ key, href, icon: Icon, label }) => (
            <Link
              key={key}
              href={href}
              title={label}
              onMouseEnter={(event) => {
                if (activeNavKey !== key) event.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(event) => {
                if (activeNavKey !== key) event.currentTarget.style.background = 'transparent';
              }}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'center',
                padding: 8,
                borderRadius: 8,
                background: activeNavKey === key ? 'var(--accent-soft)' : 'transparent',
                color: activeNavKey === key ? 'var(--accent-text)' : 'var(--text-secondary)',
                transition: 'background 0.15s ease',
              }}
            >
              <Icon size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div style={{ padding: 12 }}>
            <button
              onClick={() => void newChat()}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              <Plus size={14} /> 새 질문
            </button>
          </div>

          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                className="input"
                placeholder="대화 검색..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  paddingLeft: 30,
                  fontSize: 13,
                  height: 34,
                  background: 'transparent',
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>{renderSessionList()}</div>

          <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
            {navItems.map(({ key, href, icon: Icon, label }) => {
              const active = activeNavKey === key;
              return (
                <Link
                  key={key}
                  href={href}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontFamily: 'var(--font)',
                    fontWeight: active ? 500 : 400,
                    marginBottom: 2,
                    textDecoration: 'none',
                  }}
                >
                  <Icon size={15} /> {label}
                </Link>
              );
            })}

            <div
              style={{
                marginTop: 8,
                padding: '10px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: '#c8d8d0',
                  color: '#2d4a3a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    margin: 0,
                    letterSpacing: '-0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {userName ?? '사용자'}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {roleLabel}
                </p>
              </div>
              <button
                onClick={() => void handleLogout()}
                className="btn-ghost"
                style={{ padding: 6 }}
                aria-label="로그아웃"
                title="로그아웃"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );

  return (
    <>
      {renderDesktopSidebar()}

      <button
        type="button"
        className="btn-secondary app-mobile-menu-button mobile-only"
        aria-label="메뉴 열기"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      <div
        className={`app-mobile-drawer-backdrop ${mobileOpen ? 'is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`app-mobile-drawer ${mobileOpen ? 'is-open' : ''}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 16px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Link href="/chat" style={{ textDecoration: 'none' }}>
            <BrandLockup />
          </Link>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: 6 }}
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 12 }}>
          <button
            onClick={() => void newChat()}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Plus size={14} /> 새 질문
          </button>
        </div>

        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              className="input"
              placeholder="대화 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                paddingLeft: 30,
                fontSize: 13,
                height: 38,
                background: 'transparent',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '0 12px 10px', display: 'grid', gap: 4 }}>
          {navItems.map(({ key, href, icon: Icon, label }) => {
            const active = activeNavKey === key;
            return (
              <Link
                key={key}
                href={href}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  textDecoration: 'none',
                }}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 8px' }}>{renderSessionList(true)}</div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: '#c8d8d0',
                color: '#2d4a3a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {userName ?? '사용자'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleLabel}</div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: 6 }}
              onClick={() => void handleLogout()}
              aria-label="로그아웃"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <nav
        className={`app-mobile-bottom-nav mobile-only ${mobileOpen ? 'is-hidden' : ''}`}
        aria-label="모바일 내비게이션"
      >
        {mobileNavItems.map(({ key, href, icon: Icon, label }) => {
          const active = activeNavKey === key;
          return (
            <Link
              key={key}
              href={href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '6px 4px',
                minWidth: 0,
                textDecoration: 'none',
                color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                background: active ? 'var(--accent-soft)' : 'transparent',
                borderRadius: 12,
                fontSize: 10,
                fontWeight: active ? 600 : 500,
                letterSpacing: '-0.01em',
              }}
            >
              <Icon size={16} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
