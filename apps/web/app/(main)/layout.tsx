'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUserStore } from '../../store/user.store';
import { Sidebar } from '../../components/layout/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const accessToken = useUserStore((s) => s.accessToken);

  useEffect(() => {
    if (hasHydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hasHydrated, accessToken, router]);

  if (!hasHydrated || !accessToken) return null;

  return (
    <div
      className="app-shell-responsive"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      <Sidebar />
      <main
        className="app-main-responsive"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </main>
    </div>
  );
}
