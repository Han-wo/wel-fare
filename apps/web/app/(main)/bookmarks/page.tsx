'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Calendar, Check, MoreHorizontal } from 'lucide-react';
import { api } from '../../../lib/api';
import { TagPill } from '../../../components/ui/tag-pill';
import {
  type Policy,
  categoryLabel,
  deadlineTag,
  formatAmount,
} from '../../../lib/policy';
import { formatRelativeKoreanTime } from '../../../lib/datetime';

interface Bookmark {
  id: string;
  policyId: string;
  status: 'SAVED' | 'APPLIED' | 'EXPIRED' | string;
  memo?: string;
  appliedAt?: string;
  createdAt: string;
  policy: Policy | null;
}

type TabKey = 'all' | 'saved' | 'applied' | 'expired';

const TAB_DEFS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'saved', label: '신청 전' },
  { key: 'applied', label: '신청 완료' },
  { key: 'expired', label: '마감' },
];

function daysUntilEnd(policy: Policy | null): number | null {
  if (!policy?.applicationEnd) return null;
  const end = new Date(policy.applicationEnd);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function BookmarksPage() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    setLoading(true);
    api<Bookmark[]>('/bookmarks')
      .then((data) => setBookmarks(data))
      .catch(() => setBookmarks([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const base = { all: bookmarks.length, saved: 0, applied: 0, expired: 0 };
    for (const b of bookmarks) {
      if (b.status === 'APPLIED') base.applied += 1;
      else if (b.status === 'EXPIRED') base.expired += 1;
      else base.saved += 1;
    }
    return base;
  }, [bookmarks]);

  const filtered = useMemo(() => {
    return bookmarks.filter((b) => {
      if (tab === 'all') return true;
      if (tab === 'applied') return b.status === 'APPLIED';
      if (tab === 'expired') return b.status === 'EXPIRED';
      return b.status !== 'APPLIED' && b.status !== 'EXPIRED';
    });
  }, [bookmarks, tab]);

  const urgent = useMemo(() => {
    return bookmarks.filter((b) => {
      const days = daysUntilEnd(b.policy);
      return days !== null && days >= 0 && days <= 7 && b.status !== 'APPLIED';
    });
  }, [bookmarks]);

  return (
    <>
      <header
        className="page-header-responsive"
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
        }}
      >
        <div>
          <h1
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}
          >
            저장한 정책
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {loading ? '불러오는 중...' : `${bookmarks.length}건`}
          </p>
        </div>
        <div className="page-actions-responsive" style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ height: 36 }}>
            <Calendar size={14} /> 정렬
          </button>
        </div>
      </header>

      <div
        className="page-content-responsive"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 28px 28px',
          background: 'var(--bg-canvas)',
        }}
      >
        {urgent.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            <Bell size={14} style={{ color: 'var(--warning-text)', flexShrink: 0 }} />
            <span
              style={{
                fontSize: 13,
                color: 'var(--warning-text)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ fontWeight: 600 }}>{urgent.length}건의 정책</strong>이
              이번 주 내 마감됩니다. 신청 서류를 준비하세요.
            </span>
          </div>
        )}

        <div
          className="bookmarks-tabs-responsive"
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {TAB_DEFS.map(({ key, label }) => {
            const active = tab === key;
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: active
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                  marginBottom: -1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font)',
                }}
              >
                {label}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: active ? 'var(--accent-soft)' : 'var(--bg-hover)',
                    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 8 }} aria-label="불러오는 중">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 84 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: '64px 0',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            {tab === 'all'
              ? '저장한 정책이 없습니다. 정책 목록에서 저장해보세요.'
              : '해당 상태의 저장된 정책이 없습니다.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((b) => {
              if (!b.policy) return null;
              const deadline = deadlineTag(b.policy.applicationEnd);
              return (
                <div
                  className="bookmarks-row-responsive"
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/policies/${b.policy!.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/policies/${b.policy!.id}`);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginBottom: 6,
                      }}
                    >
                      <TagPill kind="accent">{categoryLabel(b.policy.category)}</TagPill>
                      {b.policy.provider && <TagPill>{b.policy.provider}</TagPill>}
                      <TagPill
                        kind={
                          deadline.kind === 'danger'
                            ? 'danger'
                            : deadline.kind === 'warning'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {deadline.label}
                      </TagPill>
                      {b.status === 'APPLIED' && (
                        <TagPill kind="accent">
                          <Check size={10} style={{ marginRight: 3 }} />
                          신청 완료
                        </TagPill>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        letterSpacing: '-0.01em',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.policy.name}
                    </div>
                  </div>
                  <div className="bookmark-meta-responsive" style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--accent-text)',
                      }}
                    >
                      {formatAmount(b.policy.benefitAmount, b.policy.benefitType)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      저장 {formatRelativeKoreanTime(b.createdAt)}
                    </div>
                  </div>
                  <button
                    className="btn-ghost bookmark-actions-responsive"
                    style={{ padding: 6 }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    aria-label="더보기"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
