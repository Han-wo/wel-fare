'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowUp, Bookmark, Loader2, MapPin, User as UserIcon } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { emitChatSessionsUpdated } from '../../../lib/chat-events';
import { BrandMark } from '../../../components/brand-mark';

const STARTERS = [
  { title: '주거 지원', body: '내 조건에서 지금 신청 가능한 주거 지원 찾아줘' },
  { title: '마감 임박', body: '청년 정책 중 마감 임박한 것만 보여줘' },
  { title: '돌봄 · 복지시설', body: '부모님 근처 복지시설과 돌봄 지원 같이 알려줘' },
  { title: '생활비 지원', body: '저소득층 생활비 지원이 있는지 정리해줘' },
];

const SIDO_MAP: Record<string, string> = {
  '11': '서울',
  '26': '부산',
  '27': '대구',
  '28': '인천',
  '29': '광주',
  '30': '대전',
  '31': '울산',
  '36': '세종',
  '41': '경기',
  '43': '충북',
  '44': '충남',
  '45': '전북',
  '46': '전남',
  '47': '경북',
  '48': '경남',
  '50': '제주',
};

const HOUSEHOLD_MAP: Record<string, string> = {
  SINGLE: '1인 가구',
  COUPLE: '부부 가구',
  FAMILY: '가족 가구',
  SINGLE_PARENT: '한부모 가구',
};

function ChatIndex() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = useUserStore((s) => s.accessToken);
  const userName = useUserStore((s) => s.userName);
  const profile = useUserStore((s) => s.profile);

  const [input, setInput] = useState(() => searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const cacheKey = 'suggestions_cache';
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, expiresAt } = JSON.parse(cached) as {
          data: string[];
          expiresAt: number;
        };
        if (expiresAt > Date.now()) {
          setSuggestions(data);
          return;
        }
      } catch {
        // ignore
      }
    }
    api<string[]>('/rag/suggestions')
      .then((data) => {
        setSuggestions(data);
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ data, expiresAt: Date.now() + 5 * 60 * 1000 }),
        );
      })
      .catch(() => setSuggestions([]));
  }, [accessToken]);

  const starterCards = useMemo(() => {
    if (suggestions.length > 0) {
      return suggestions.slice(0, 4).map((body, i) => ({
        title: STARTERS[i]?.title ?? `추천 ${i + 1}`,
        body,
      }));
    }
    return STARTERS;
  }, [suggestions]);

  const startChat = async (question?: string) => {
    const query = (question ?? input).trim();
    if (!query) return;
    setLoading(true);
    try {
      const session = await api<{ id: string }>('/chat/sessions', {
        method: 'POST',
        body: { title: query.slice(0, 40) },
      });
      emitChatSessionsUpdated();
      router.push(`/chat/${session.id}?q=${encodeURIComponent(query)}`);
    } catch {
      setLoading(false);
    }
  };

  const regionLabel = profile?.sidoCode ? SIDO_MAP[profile.sidoCode] : null;
  const householdLabel = profile?.householdType ? HOUSEHOLD_MAP[profile.householdType] : null;
  const greetingName = userName ?? '사용자';

  return (
    <>
      <header
        className="page-header-responsive"
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 500,
            margin: 0,
            color: 'var(--text-secondary)',
          }}
        >
          새 대화
        </h2>
        <div className="page-actions-responsive" style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn-ghost"
            aria-label="저장한 정책"
            onClick={() => router.push('/bookmarks')}
          >
            <Bookmark size={14} />
          </button>
        </div>
      </header>

      <div
        className="chat-home-responsive"
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 32px',
        }}
      >
        <div style={{ maxWidth: 680, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <BrandMark size={48} style={{ marginBottom: 16 }} />
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: '16px 0 8px',
                color: 'var(--text-primary)',
              }}
            >
              안녕하세요, {greetingName}님
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
              어떤 복지 제도를 찾아볼까요?
            </p>
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 14,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void startChat();
                }
              }}
              placeholder="질문을 입력하세요..."
              disabled={loading}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: 'var(--font)',
                fontSize: 15,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: 'transparent',
                minHeight: 48,
                padding: '6px 4px',
              }}
            />
            <div
              className="landing-panel-footer-responsive"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {regionLabel && (
                  <span className="btn-ghost" style={{ fontSize: 12, cursor: 'default' }}>
                    <MapPin size={13} /> {regionLabel}
                  </span>
                )}
                {householdLabel && (
                  <span className="btn-ghost" style={{ fontSize: 12, cursor: 'default' }}>
                    <UserIcon size={13} /> {householdLabel}
                  </span>
                )}
              </div>
              <button
                className="btn-primary"
                style={{ padding: '8px 10px' }}
                aria-label="전송"
                onClick={() => void startChat()}
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowUp size={14} />
                )}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginBottom: 10,
                letterSpacing: '0.04em',
              }}
            >
              추천 질문
            </p>
            <div
              className="chat-starters-grid-responsive"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              {starterCards.map((s) => (
                <button
                  key={s.body}
                  onClick={() => void startChat(s.body)}
                  disabled={loading}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg-subtle)';
                  }}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    textAlign: 'left',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font)',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--accent-text)',
                      margin: 0,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {s.title}
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      margin: '4px 0 0',
                      lineHeight: 1.5,
                      letterSpacing: '-0.01em',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {s.body}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ChatIndexPage() {
  return (
    <Suspense fallback={null}>
      <ChatIndex />
    </Suspense>
  );
}
