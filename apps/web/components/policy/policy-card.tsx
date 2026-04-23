'use client';

import { Bookmark, ExternalLink } from 'lucide-react';

export interface PolicyCardProps {
  title: string;
  tag?: string;
  agency?: string;
  deadline?: string;
  eligibility?: string;
  amount?: string;
  officialUrl?: string;
  bookmarked?: boolean;
  onBookmark?: () => void;
  onOpen?: () => void;
}

export function PolicyCard({
  title,
  tag,
  agency,
  deadline,
  eligibility,
  amount,
  officialUrl,
  bookmarked,
  onBookmark,
  onOpen,
}: PolicyCardProps) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg-subtle)',
        padding: 16,
        marginTop: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
          >
            {tag && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-text)',
                }}
              >
                {tag}
              </span>
            )}
            {agency && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agency}</span>
            )}
          </div>
          <h4
            style={{
              fontSize: 15,
              fontWeight: 600,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h4>
        </div>
        <button
          className="btn-ghost"
          style={{ padding: 6, color: bookmarked ? 'var(--accent)' : undefined }}
          onClick={onBookmark}
          aria-label={bookmarked ? '북마크 해제' : '북마크 추가'}
        >
          <Bookmark size={14} fill={bookmarked ? 'var(--accent)' : 'none'} />
        </button>
      </div>

      {(amount || deadline || eligibility) && (
        <div
          className="detail-metrics-responsive"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginTop: 14,
          }}
        >
          {amount && (
            <Field label="지원 금액" value={amount} />
          )}
          {deadline && (
            <Field label="신청 기한" value={deadline} accent />
          )}
          {eligibility && (
            <Field label="대상" value={eligibility} />
          )}
        </div>
      )}

      <div className="policy-card-footer-responsive" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {officialUrl && (
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ fontSize: 12, padding: '7px 12px' }}
          >
            <ExternalLink size={12} /> 공식 신청 페이지
          </a>
        )}
        {onOpen && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onOpen}>
            자세히 보기
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, marginBottom: 2 }}>
        {label}
      </p>
      <p
        style={{
          fontSize: 13,
          margin: 0,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: accent ? 'var(--accent)' : 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </p>
    </div>
  );
}
