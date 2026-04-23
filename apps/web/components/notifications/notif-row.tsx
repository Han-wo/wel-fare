'use client';

import { Bell, Clock, RefreshCw, Settings, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export type NotifType = 'deadline' | 'match' | 'info' | 'update' | 'system';

const ICON_MAP: Record<NotifType, { icon: ReactNode; color: string; bg: string }> = {
  deadline: {
    icon: <Clock size={14} />,
    color: '#8a5d10',
    bg: '#f9f0d9',
  },
  match: {
    icon: <Sparkles size={14} />,
    color: 'var(--accent-text)',
    bg: 'var(--accent-soft)',
  },
  info: {
    icon: <Bell size={14} />,
    color: 'var(--text-secondary)',
    bg: 'var(--bg-hover)',
  },
  update: {
    icon: <RefreshCw size={14} />,
    color: 'var(--accent-text)',
    bg: 'var(--accent-soft)',
  },
  system: {
    icon: <Settings size={14} />,
    color: 'var(--text-secondary)',
    bg: 'var(--bg-hover)',
  },
};

export interface NotifRowProps {
  type: NotifType;
  title: string;
  detail?: string;
  time: string;
  unread?: boolean;
  onClick?: () => void;
}

export function NotifRow({ type, title, detail, time, unread, onClick }: NotifRowProps) {
  const t = ICON_MAP[type];
  return (
    <div
      className="notif-row-responsive"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 16px',
        background: unread ? 'var(--bg-surface)' : 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 10,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {unread && (
        <span
          style={{
            position: 'absolute',
            left: -4,
            top: 20,
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--accent)',
          }}
        />
      )}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: t.bg,
          color: t.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {t.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="notif-row-header-responsive"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: unread ? 600 : 500,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {time}
          </span>
        </div>
        {detail && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: '4px 0 0',
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
