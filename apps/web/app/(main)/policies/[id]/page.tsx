'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark as BookmarkIcon, Check, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { api } from '../../../../lib/api';
import { TagPill } from '../../../../components/ui/tag-pill';
import {
  type Policy,
  categoryLabel,
  deadlineTag,
  formatAmount,
  formatDeadline,
} from '../../../../lib/policy';

interface Bookmark {
  id: string;
  policyId: string;
  status: string;
}

export default function PolicyDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<Policy>(`/policies/${id}`)
      .then(setPolicy)
      .catch(() => setPolicy(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api<Array<Bookmark>>('/bookmarks')
      .then((bms) => {
        const match = bms.find((b) => b.policyId === id);
        setBookmarkId(match?.id ?? null);
      })
      .catch(() => {});
  }, [id]);

  const toggleBookmark = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (bookmarkId) {
        await api(`/bookmarks/${bookmarkId}`, { method: 'DELETE' });
        setBookmarkId(null);
      } else {
        const bm = await api<Bookmark>('/bookmarks', {
          method: 'POST',
          body: { policyId: id },
        });
        setBookmarkId(bm.id);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: 'var(--text-muted)',
        }}
      >
        <p style={{ fontSize: 14, margin: 0 }}>정책을 불러올 수 없습니다.</p>
        <button className="btn-secondary" onClick={() => router.push('/policies')}>
          목록으로
        </button>
      </div>
    );
  }

  const deadline = deadlineTag(policy.applicationEnd);

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
        <button
          className="btn-ghost"
          onClick={() => router.push('/policies')}
          style={{ padding: '6px 10px' }}
        >
          <ArrowLeft size={14} /> 목록
        </button>
        <div className="page-actions-responsive" style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            style={{ height: 36, color: bookmarkId ? 'var(--accent)' : undefined }}
            onClick={() => void toggleBookmark()}
            disabled={saving}
          >
            <BookmarkIcon
              size={14}
              fill={bookmarkId ? 'var(--accent)' : 'none'}
            />
            {bookmarkId ? '저장됨' : '저장'}
          </button>
          {policy.applyUrl && (
            <a
              href={policy.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ height: 36 }}
            >
              <ExternalLink size={14} /> 공식 신청
            </a>
          )}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-canvas)' }}>
        <div
          className="page-content-responsive"
          style={{ maxWidth: 880, margin: '0 auto', padding: '28px 28px 40px' }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <TagPill kind="accent">{categoryLabel(policy.category)}</TagPill>
            {policy.provider && <TagPill>{policy.provider}</TagPill>}
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
          </div>

          <h1
            style={{
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              margin: 0,
              lineHeight: 1.25,
              color: 'var(--text-primary)',
            }}
          >
            {policy.name}
          </h1>

          {policy.summary && (
            <p
              style={{
                fontSize: 15,
                color: 'var(--text-secondary)',
                lineHeight: 1.75,
                margin: '14px 0 0',
                maxWidth: 680,
              }}
            >
              {policy.summary}
            </p>
          )}

          <div
            className="detail-metrics-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              marginTop: 24,
            }}
          >
            <KeyMetric
              label="지원 금액"
              value={formatAmount(policy.benefitAmount, policy.benefitType)}
            />
            <KeyMetric
              label="신청 기한"
              value={formatDeadline(policy.applicationEnd)}
              accent={deadline.kind !== 'default'}
            />
            <KeyMetric
              label="대상"
              value={policy.targetSummary ?? '제한 없음'}
            />
          </div>

          {policy.targetSummary && (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                background: 'var(--accent-soft)',
                border: '1px solid rgba(45,106,95,0.2)',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <Check size={14} style={{ color: 'var(--accent-text)' }} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--accent-text)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  지원 대상
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--accent-text)',
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {policy.targetSummary}
              </p>
            </div>
          )}

          {policy.content && (
            <SectionBlock title="지원 내용">
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {policy.content}
              </p>
            </SectionBlock>
          )}

          {policy.requirements && policy.requirements.length > 0 && (
            <SectionBlock title="신청 자격">
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: 'none',
                  display: 'grid',
                  gap: 8,
                }}
              >
                {policy.requirements.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      lineHeight: 1.7,
                      display: 'flex',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        marginTop: 8,
                        flexShrink: 0,
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        background: 'var(--accent)',
                        display: 'inline-block',
                      }}
                    />
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {policy.tags && policy.tags.length > 0 && (
            <SectionBlock title="태그">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {policy.tags.map((t) => (
                  <TagPill key={t}>{t}</TagPill>
                ))}
              </div>
            </SectionBlock>
          )}

          <SectionBlock title="출처">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <FileText size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {policy.source}
                {policy.externalId && ` · ${policy.externalId}`}
                {policy.contact && ` · 문의 ${policy.contact}`}
              </span>
            </div>
          </SectionBlock>
        </div>
      </div>
    </>
  );
}

function KeyMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 6,
          color: accent ? 'var(--accent-text)' : 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          margin: '0 0 12px',
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
