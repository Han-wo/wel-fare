'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Settings } from 'lucide-react';
import { api } from '../../../lib/api';
import { NotifRow, type NotifType } from '../../../components/notifications/notif-row';
import { formatRelativeKoreanTime } from '../../../lib/datetime';

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  policyId?: string;
  isRead: boolean;
  sentAt?: string;
  createdAt: string;
}

type TabKey = 'all' | 'unread' | 'deadline' | 'match';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'unread', label: '읽지 않음' },
  { key: 'deadline', label: '기한 임박' },
  { key: 'match', label: '신규 매칭' },
];

function normalizeType(raw: string): NotifType {
  const t = raw.toLowerCase();
  if (t.includes('deadline')) return 'deadline';
  if (t.includes('match')) return 'match';
  if (t.includes('update')) return 'update';
  if (t.includes('system')) return 'system';
  return 'info';
}

type Bucket = 'today' | 'week' | 'older';

function bucket(value: string): Bucket {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'older';
  const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 1) return 'today';
  if (diff < 7) return 'week';
  return 'older';
}

const BUCKET_LABEL: Record<Bucket, string> = {
  today: '오늘',
  week: '이번 주',
  older: '이전',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    setLoading(true);
    api<Notification[]>('/notifications')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const unread = items.filter((i) => !i.isRead).length;
    const deadline = items.filter((i) => normalizeType(i.type) === 'deadline').length;
    const match = items.filter((i) => normalizeType(i.type) === 'match').length;
    return { all: items.length, unread, deadline, match };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (tab === 'all') return true;
      if (tab === 'unread') return !i.isRead;
      if (tab === 'deadline') return normalizeType(i.type) === 'deadline';
      if (tab === 'match') return normalizeType(i.type) === 'match';
      return true;
    });
  }, [items, tab]);

  const grouped = useMemo(() => {
    const groups: Record<Bucket, Notification[]> = { today: [], week: [], older: [] };
    for (const it of filtered) {
      groups[bucket(it.createdAt)].push(it);
    }
    return groups;
  }, [filtered]);

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    } catch {
      // ignore
    }
  };

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
            알림
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {loading
              ? '불러오는 중...'
              : `읽지 않음 ${counts.unread}건 · 전체 ${counts.all}건`}
          </p>
        </div>
        <div className="page-actions-responsive" style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-ghost"
            onClick={() => void markAllRead()}
            disabled={counts.unread === 0}
          >
            모두 읽음 처리
          </button>
          <button className="btn-secondary" style={{ height: 36 }}>
            <Settings size={14} /> 설정
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
        <div
          className="notifications-tabs-responsive"
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {TABS.map(({ key, label }) => {
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
          <div
            style={{
              padding: '64px 0',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              gap: 8,
            }}
          >
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
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
            표시할 알림이 없습니다.
          </div>
        ) : (
          (['today', 'week', 'older'] as Bucket[]).map((b) => {
            const list = grouped[b];
            if (list.length === 0) return null;
            return (
              <div key={b} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 10,
                  }}
                >
                  {BUCKET_LABEL[b]}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {list.map((n) => (
                    <NotifRow
                      key={n.id}
                      type={normalizeType(n.type)}
                      title={n.title}
                      detail={n.body}
                      time={formatRelativeKoreanTime(n.createdAt)}
                      unread={!n.isRead}
                      onClick={n.isRead ? undefined : () => void markRead(n.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
