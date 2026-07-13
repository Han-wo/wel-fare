'use client';

import { Bookmark } from 'lucide-react';
import { TagPill } from '../ui/tag-pill';

export interface PolicyListCardProps {
  title: string;
  tag?: string;
  agency?: string;
  deadline?: string;
  amount?: string;
  desc?: string;
  urgent?: boolean;
  isNew?: boolean;
  bookmarked?: boolean;
  onClick?: () => void;
  onBookmark?: () => void;
}

export function PolicyListCard({
  title,
  tag,
  agency,
  deadline,
  amount,
  desc,
  urgent,
  isNew,
  bookmarked,
  onClick,
  onBookmark,
}: PolicyListCardProps) {
  const deadlineKind: 'warning' | 'danger' | 'default' = urgent
    ? 'danger'
    : deadline && /^D-?\d/.test(deadline)
      ? 'warning'
      : 'default';

  return (
    <div
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
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.borderColor = 'var(--border)';
      }}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {tag && <TagPill kind="accent">{tag}</TagPill>}
          {agency && <TagPill>{agency}</TagPill>}
          {deadline && <TagPill kind={deadlineKind}>{deadline}</TagPill>}
          {isNew && <TagPill kind="accent">NEW</TagPill>}
        </div>
        {onBookmark && (
          <button
            className="btn-ghost"
            style={{ padding: 6, color: bookmarked ? 'var(--accent)' : undefined }}
            onClick={(e) => {
              e.stopPropagation();
              onBookmark();
            }}
            aria-label={bookmarked ? '북마크 해제' : '북마크 추가'}
          >
            <Bookmark size={14} fill={bookmarked ? 'var(--accent)' : 'none'} />
          </button>
        )}
      </div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          margin: '12px 0 6px',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h3>
      {desc && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {desc}
        </p>
      )}
      {(amount || onClick) && (
        <div
          className="policy-card-footer-responsive"
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {amount ? (
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--accent-text)',
                letterSpacing: '-0.01em',
              }}
            >
              {amount}
            </span>
          ) : (
            <span />
          )}
          {onClick && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>자세히 보기 →</span>
          )}
        </div>
      )}
    </div>
  );
}
