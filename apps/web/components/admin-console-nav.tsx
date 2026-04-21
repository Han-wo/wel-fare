'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useUserStore } from '../store/user.store';
import { logoutRequest } from '../lib/api';

const ITEMS = [
  { href: '/admin', label: '동기화 현황' },
  { href: '/admin/traces', label: 'AI 추적' },
];

export function AdminConsoleNav({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useUserStore((state) => state.clearAuth);

  const handleLogout = async () => {
    await logoutRequest();
    clearAuth();
    router.push('/');
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {ITEMS.map((item) => {
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex h-12 items-center rounded-full px-5 text-sm font-semibold transition ${
                active
                  ? 'bg-[var(--brand-strong)] text-white shadow-[0_12px_24px_rgba(47,111,91,0.2)]'
                  : 'border border-[var(--panel-border)] bg-white/76 text-[var(--text-secondary)] hover:bg-white hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--panel-border)] bg-white/76 px-5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-white hover:text-[var(--text-primary)]"
        >
          <LogOut size={15} />
          로그아웃
        </button>
      </div>
    </div>
  );
}
