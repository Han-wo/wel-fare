import type { CSSProperties, ReactNode } from 'react';

type TagKind = 'accent' | 'warning' | 'danger' | 'success' | 'default';

const KIND_STYLES: Record<TagKind, { background: string; color: string }> = {
  accent: { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
  warning: { background: 'var(--warning-soft)', color: 'var(--warning-text)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--danger)' },
  success: { background: 'var(--success-soft)', color: 'var(--success)' },
  default: { background: 'var(--bg-hover)', color: 'var(--text-secondary)' },
};

export function TagPill({
  children,
  kind = 'default',
  style,
}: {
  children: ReactNode;
  kind?: TagKind;
  style?: CSSProperties;
}) {
  const s = KIND_STYLES[kind];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 999,
        background: s.background,
        color: s.color,
        letterSpacing: '-0.005em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
