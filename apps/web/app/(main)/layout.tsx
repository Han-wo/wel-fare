'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, User, LogOut, ChevronLeft, Plus, Shield, Trash2 } from 'lucide-react';
import { useUserStore } from '../../store/user.store';
import { api } from '../../lib/api';
import {
  CHAT_SESSIONS_UPDATED,
  emitChatSessionCloseRequested,
  emitChatSessionsUpdated,
} from '../../lib/chat-events';
import { BrandLockup, BrandMark } from '../../components/brand-mark';
import { formatRelativeKoreanTime } from '../../lib/datetime';

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const accessToken = useUserStore((s) => s.accessToken);
  const userRole = useUserStore((s) => s.userRole);
  const clearAuth = useUserStore((s) => s.clearAuth);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (hasHydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hasHydrated, accessToken, router]);

  const refreshSessions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await api<Session[]>('/chat/sessions');
      startTransition(() => {
        setSessions(data);
      });
    } catch {
      // ignore
    }
  }, [accessToken]);

  const goToSession = useCallback(
    (sessionId: string) => {
      router.push(`/chat/${sessionId}`);
    },
    [router],
  );

  useEffect(() => {
    if (!accessToken) return;

    void refreshSessions();
    const onUpdate = () => {
      void refreshSessions();
    };

    window.addEventListener(CHAT_SESSIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(CHAT_SESSIONS_UPDATED, onUpdate);
  }, [accessToken, refreshSessions]);

  const deleteSession = useCallback(
    async (event: React.MouseEvent, sessionId: string, title: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (!window.confirm(`"${title || '새 대화'}" 대화를 삭제하시겠습니까?`)) return;

      try {
        await api(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
        startTransition(() => {
          setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        });
        emitChatSessionsUpdated();
        if (pathname === `/chat/${sessionId}`) {
          router.push('/chat');
        }
      } catch {
        // ignore
      }
    },
    [pathname, router],
  );

  const handleLogout = useCallback(() => {
    clearAuth();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    router.push('/');
  }, [clearAuth, router]);

  const activeSessionId = useMemo(() => {
    if (!pathname.startsWith('/chat/')) return null;
    return pathname.split('/')[2] ?? null;
  }, [pathname]);

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
      router.push(`/chat/${session.id}`);
    } catch {
      router.push('/chat');
    }
  }, [activeSessionId, router]);

  const navItems = useMemo(
    () => [
      { href: '/chat', icon: MessageSquare, label: '복지 찾기' },
      { href: '/profile', icon: User, label: '내 프로필' },
      ...(userRole === 'ADMIN' ? [{ href: '/admin', icon: Shield, label: '관리 콘솔' }] : []),
    ],
    [userRole],
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const storedSessions = useMemo(
    () => sessions.filter((session) => session.id !== activeSessionId),
    [activeSessionId, sessions],
  );

  if (!hasHydrated || !accessToken) return null;

  return (
    <div className="app-shell flex h-screen overflow-hidden text-[var(--text-primary)]">
      <aside
        className={`glass flex shrink-0 flex-col border-r border-[var(--panel-border)] transition-[width] duration-300 ${
          collapsed ? 'w-20' : 'w-[300px]'
        }`}
      >
        <div className="border-b border-[var(--panel-border)] px-4 py-4">
          <div className={`flex items-start ${collapsed ? 'justify-center' : 'justify-between'} gap-3`}>
            {!collapsed ? (
              <>
                <Link href="/chat" className="flex min-w-0 items-center gap-3">
                  <BrandLockup compact />
                </Link>

                <button
                  onClick={() => setCollapsed(true)}
                  aria-label="사이드바 접기"
                  className="rounded-full border border-[var(--panel-border)] p-2 text-[var(--text-muted)] transition hover:border-[rgba(34,79,66,0.18)] hover:bg-white/80 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.22)]"
                >
                  <ChevronLeft size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setCollapsed(false)}
                aria-label="사이드바 펼치기"
                className="rounded-2xl"
              >
                <BrandMark className="h-5 w-5" shellClassName="h-11 w-11 rounded-2xl" />
              </button>
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={newChat}
              aria-label="새 질문 시작"
              className={`button-primary w-full ${collapsed ? 'px-0' : ''}`}
            >
              <Plus size={16} />
              {!collapsed && '새 질문'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {collapsed ? (
            <div className="space-y-2">
              {sessions.slice(0, 10).map((session) => (
                <Link
                  key={session.id}
                  href={`/chat/${session.id}`}
                  className={`flex h-12 items-center justify-center rounded-2xl border transition ${
                    pathname === `/chat/${session.id}`
                      ? 'border-[rgba(47,111,91,0.2)] bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                      : 'border-[var(--panel-border)] bg-white/50 text-[var(--text-muted)] hover:bg-white/85 hover:text-[var(--text-primary)]'
                  }`}
                >
                  <MessageSquare size={15} />
                </Link>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="surface-soft rounded-[26px] px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">아직 시작한 질문이 없습니다</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                새 질문을 시작하면 최근 대화가 이곳에 저장됩니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeSession ? (
                <section className="space-y-2">
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    현재 대화
                  </p>
                  <SessionListItem
                    session={activeSession}
                    active
                    onOpen={goToSession}
                    onDelete={deleteSession}
                  />
                </section>
              ) : null}

              {storedSessions.length > 0 ? (
                <section className="space-y-2">
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    저장된 대화
                  </p>
                  {storedSessions.slice(0, 20).map((session) => (
                    <SessionListItem
                      key={session.id}
                      session={session}
                      active={false}
                      onOpen={goToSession}
                      onDelete={deleteSession}
                    />
                  ))}
                </section>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--panel-border)] px-3 py-3">
          <div className={collapsed ? 'space-y-2' : 'space-y-2.5'}>
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center rounded-2xl px-3 py-3 text-sm transition ${
                    active
                      ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                      : 'text-[var(--text-secondary)] hover:bg-white/80 hover:text-[var(--text-primary)]'
                  } ${collapsed ? 'justify-center' : 'gap-3'}`}
                >
                  <Icon size={16} />
                  {!collapsed && label}
                </Link>
              );
            })}

            <button
              onClick={handleLogout}
              className={`flex w-full items-center rounded-2xl px-3 py-3 text-sm text-[var(--text-secondary)] transition hover:bg-red-400/10 hover:text-red-600 ${
                collapsed ? 'justify-center' : 'gap-3'
              }`}
            >
              <LogOut size={16} />
              {!collapsed && '로그아웃'}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function SessionListItem({
  session,
  active,
  onOpen,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onOpen: (sessionId: string) => void;
  onDelete: (event: React.MouseEvent, sessionId: string, title: string) => Promise<void>;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(session.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(session.id);
        }
      }}
      className={`group rounded-[22px] border px-4 py-3.5 transition ${
        active
          ? 'border-[rgba(47,111,91,0.16)] bg-[var(--brand-soft)]'
          : 'border-transparent bg-white/50 hover:border-[var(--panel-border)] hover:bg-white/82'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {session.title || '새 대화'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatRelativeKoreanTime(session.updatedAt)}
          </p>
        </div>

        <button
          onClick={(event) => void onDelete(event, session.id, session.title)}
          type="button"
          aria-label={`"${session.title || '새 대화'}" 삭제`}
          className="rounded-full border border-transparent p-1.5 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100 hover:border-red-400/14 hover:bg-red-400/10 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/20"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
