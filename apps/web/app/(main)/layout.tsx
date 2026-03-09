'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Sparkles, MessageSquare, User, Settings, LogOut,
  LayoutDashboard, ChevronRight, Plus, Shield,
} from 'lucide-react';
import { useUserStore } from '../../store/user.store';
import { api } from '../../lib/api';

interface Session { id: string; title: string; updatedAt: string }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, userName, userRole, clearAuth } = useUserStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!accessToken) { router.replace('/login'); }
  }, [accessToken, router]);

  useEffect(() => {
    if (!accessToken) return;
    api<Session[]>('/chat/sessions').then(setSessions).catch(() => {});
  }, [accessToken]);

  const handleLogout = () => {
    clearAuth();
    localStorage.removeItem('accessToken');
    router.push('/');
  };

  const newChat = async () => {
    try {
      const session = await api<{ id: string }>('/chat/sessions', { method: 'POST', body: { title: '새 대화' } });
      router.push(`/chat/${session.id}`);
    } catch {
      router.push('/chat');
    }
  };

  const navItems = [
    { href: '/chat', icon: MessageSquare, label: '채팅' },
    { href: '/profile', icon: User, label: '내 프로필' },
    ...(userRole === 'ADMIN' ? [{ href: '/admin', icon: Shield, label: '관리자' }] : []),
  ];

  if (!accessToken) return null;

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      {/* ── 사이드바 ── */}
      <aside className={`flex flex-col border-r border-white/5 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} shrink-0`}>
        {/* 로고 */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
          {!collapsed && (
            <Link href="/chat" className="flex items-center gap-2 font-bold text-sm">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center shrink-0">
                <Sparkles size={13} className="text-white" />
              </div>
              <span className="gradient-text">WelfareAI</span>
            </Link>
          )}
          {collapsed && (
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center mx-auto">
              <Sparkles size={13} className="text-white" />
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="text-gray-600 hover:text-gray-400 transition">
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* 새 채팅 버튼 */}
        <div className="px-3 py-3">
          <button
            onClick={newChat}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-sm font-medium transition ${collapsed ? 'justify-center' : ''}`}
          >
            <Plus size={16} />
            {!collapsed && '새 대화'}
          </button>
        </div>

        {/* 최근 대화 목록 */}
        {!collapsed && sessions.length > 0 && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            <p className="text-xs text-gray-600 px-2 py-1.5 uppercase tracking-wider">최근 대화</p>
            {sessions.slice(0, 20).map((s) => (
              <Link
                key={s.id}
                href={`/chat/${s.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition truncate ${
                  pathname === `/chat/${s.id}` ? 'bg-white/5 text-white' : ''
                }`}
              >
                <MessageSquare size={12} className="shrink-0" />
                <span className="truncate">{s.title || '새 대화'}</span>
              </Link>
            ))}
          </div>
        )}
        {!collapsed && sessions.length === 0 && <div className="flex-1" />}
        {collapsed && <div className="flex-1" />}

        {/* 하단 네비게이션 */}
        <div className="border-t border-white/5 p-3 space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition ${
                pathname.startsWith(href)
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon size={16} />
              {!collapsed && label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={16} />
            {!collapsed && '로그아웃'}
          </button>
        </div>

        {/* 유저 정보 */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/5 flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0">
              {userName?.charAt(0) ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-gray-600">{userRole === 'ADMIN' ? '관리자' : '일반 회원'}</p>
            </div>
          </div>
        )}

        {/* 접힘 상태 토글 */}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="p-4 text-gray-600 hover:text-gray-400 flex justify-center border-t border-white/5">
            <ChevronRight size={14} className="rotate-180" />
          </button>
        )}
      </aside>

      {/* ── 메인 컨텐츠 ── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
