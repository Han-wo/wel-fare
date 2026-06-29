'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  FileText,
  LogOut,
  Menu,
  Settings,
  Shield,
  Workflow,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUserStore } from '../../store/user.store';
import { logoutRequest } from '../../lib/api';
import { BrandMark } from '../brand-mark';

interface Item {
  key: string;
  href: string | null;
  icon: LucideIcon;
  label: string;
}

const MONITORING: Item[] = [
  { key: 'sync', href: '/admin', icon: Database, label: '동기화 현황' },
  { key: 'trace', href: '/admin/traces', icon: Workflow, label: 'AI 추적' },
  { key: 'observability', href: '/admin/observability', icon: BarChart3, label: '옵저버빌리티' },
  { key: 'usage', href: null, icon: Activity, label: '사용량 통계' },
  { key: 'permission', href: null, icon: Shield, label: '권한 관리' },
];

const SETTINGS: Item[] = [
  { key: 'system', href: null, icon: Settings, label: '시스템 설정' },
  { key: 'docs', href: null, icon: FileText, label: '문서' },
];

export function AdminSidebar({ active }: { active: 'sync' | 'trace' | 'observability' }) {
  const router = useRouter();
  const pathname = usePathname();
  const userName = useUserStore((s) => s.userName);
  const clearAuth = useUserStore((s) => s.clearAuth);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const handleLogout = useCallback(async () => {
    await logoutRequest();
    clearAuth();
    router.push('/');
  }, [clearAuth, router]);

  const initials = (userName ?? 'AD').slice(0, 2).toUpperCase();
  const mobileItems = useMemo(() => MONITORING.filter((item) => item.href), []);

  const renderDrawer = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 0',
        minHeight: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 16px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <BrandMark />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>
            welFareAI
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Admin Console
          </div>
        </div>
      </div>

      <SectionHeader>Monitoring</SectionHeader>
      <nav style={{ display: 'grid', gap: 2, padding: '0 8px' }}>
        {MONITORING.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={
              item.key === active ||
              (!!item.href && pathname === item.href) ||
              (item.key === 'sync' && pathname === '/admin')
            }
          />
        ))}
      </nav>

      <SectionHeader>Settings</SectionHeader>
      <nav style={{ display: 'grid', gap: 2, padding: '0 8px' }}>
        {SETTINGS.map((item) => (
          <SidebarLink key={item.key} item={item} active={false} />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          margin: '0 10px 4px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {userName ?? '관리자'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>관리자</div>
        </div>
        <button
          className="btn-ghost"
          style={{ padding: 6 }}
          onClick={() => void handleLogout()}
          aria-label="로그아웃"
        >
          <LogOut size={14} />
        </button>
      </div>

      <div style={{ padding: '0 10px' }}>
        <Link
          href="/chat"
          className="btn-ghost"
          style={{
            width: '100%',
            fontSize: 12,
            padding: '6px 8px',
            color: 'var(--text-muted)',
            justifyContent: 'flex-start',
          }}
        >
          ← 사용자 앱으로
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="desktop-only"
        style={{
          width: 240,
          flexShrink: 0,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {renderDrawer()}
      </aside>

      <button
        type="button"
        className="btn-secondary admin-mobile-menu-button mobile-only"
        aria-label="관리 메뉴 열기"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      <div
        className={`admin-mobile-drawer-backdrop ${mobileOpen ? 'is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`admin-mobile-drawer ${mobileOpen ? 'is-open' : ''}`}
        style={{ background: 'var(--bg-sidebar)' }}
      >
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '14px 16px 0',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: 6 }}
              onClick={() => setMobileOpen(false)}
              aria-label="관리 메뉴 닫기"
            >
              <X size={16} />
            </button>
          </div>
          {renderDrawer()}
        </div>
      </aside>

      <nav
        className={`admin-mobile-bottom-nav mobile-only ${mobileOpen ? 'is-hidden' : ''}`}
        aria-label="관리자 내비게이션"
      >
        {mobileItems.map(({ key, href, icon: Icon, label }) => {
          const activeItem =
            key === active || (!!href && pathname === href) || (key === 'sync' && pathname === '/admin');
          if (!href) return null;
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
                padding: '8px 6px',
                borderRadius: 12,
                textDecoration: 'none',
                background: activeItem ? 'var(--accent-soft)' : 'transparent',
                color: activeItem ? 'var(--accent-text)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: activeItem ? 600 : 500,
              }}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px 10px 8px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function SidebarLink({ item, active }: { item: Item; active: boolean }) {
  const { icon: Icon, label, href } = item;
  const content = (
    <>
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
        <Icon size={15} />
      </span>
      {label}
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    background: active ? 'var(--bg-surface)' : 'transparent',
    border: active ? '1px solid var(--border)' : '1px solid transparent',
    color: href ? (active ? 'var(--text-primary)' : 'var(--text-secondary)') : 'var(--text-faint)',
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    letterSpacing: '-0.01em',
    cursor: href ? 'pointer' : 'not-allowed',
    textAlign: 'left' as const,
    textDecoration: 'none',
    boxShadow: active ? 'var(--shadow-sm)' : 'none',
    opacity: href ? 1 : 0.55,
  };
  if (!href) {
    return <span style={style}>{content}</span>;
  }
  return (
    <Link href={href} style={style}>
      {content}
    </Link>
  );
}

export function AdminTopbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const userName = useUserStore((s) => s.userName);
  const initials = (userName ?? 'AD').slice(0, 2).toUpperCase();
  return (
    <div
      className="page-header-responsive"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 28px',
        background: 'var(--bg-canvas)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        className="page-actions-responsive"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {actions}
        <div className="desktop-only" style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{userName ?? '관리자'}</span>
        </div>
      </div>
    </div>
  );
}
