'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { emitChatSessionsUpdated } from '../../../lib/chat-events';
import { BrandLockup } from '../../../components/brand-mark';

const QUICK_STARTS = [
  '내 조건에서 지금 신청 가능한 주거 지원 찾아줘',
  '청년 정책 중 마감 임박한 것만 보여줘',
  '부모님 근처 복지시설과 돌봄 지원 같이 알려줘',
  '저소득층 생활비 지원이 있는지 정리해줘',
];

export default function ChatIndexPage() {
  const router = useRouter();
  const accessToken = useUserStore((s) => s.accessToken);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;

    const cacheKey = 'suggestions_cache';
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const { data, expiresAt } = JSON.parse(cached) as { data: string[]; expiresAt: number };
        if (expiresAt > Date.now()) {
          setSuggestions(data);
          setSuggestionsLoading(false);
          return;
        }
      } catch {
        // ignore
      }
    }

    setSuggestionsLoading(true);
    api<string[]>('/rag/suggestions')
      .then((data) => {
        setSuggestions(data);
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ data, expiresAt: Date.now() + 5 * 60 * 1000 }),
        );
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [accessToken]);

  const startChat = async (question?: string) => {
    const query = question ?? input.trim();
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

  const mergedSuggestions = useMemo(
    () => [...new Set([...QUICK_STARTS, ...suggestions])].slice(0, 4),
    [suggestions],
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center">
        <div className="mx-auto mb-8 w-full max-w-4xl md:-translate-y-4">
          <div className="relative mx-auto w-fit">
            <div className="pulse-glow absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(67,171,212,0.14),transparent_68%)]" />
            <div className="relative mx-auto w-fit">
              <BrandLockup showCaption />
            </div>
          </div>

          <div className="mt-5 text-center">
            <p className="display-text text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)] md:text-[34px]">
              지금 필요한 지원을 바로 물어보세요
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              대상 조건, 마감 여부, 공식 신청 경로만 먼저 간단하게 정리합니다.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl">
          <section className="relative overflow-hidden rounded-[34px] border border-[var(--panel-border)] bg-white/86 px-5 py-4 shadow-[0_18px_40px_rgba(20,31,45,0.06)]">
            <div className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(67,171,212,0.34),transparent)]" />
            <div className="flex items-center gap-3">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void startChat();
                  }
                }}
                placeholder="어떤 지원을 찾고 있나요?"
                className="single-line-input flex-1 self-center bg-transparent text-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none"
                disabled={loading}
              />

              <button
                onClick={() => void startChat()}
                disabled={!input.trim() || loading}
                className="button-primary h-14 w-14 rounded-[22px] px-0 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={loading ? '질문 준비 중' : '질문 보내기'}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              </button>
            </div>
          </section>

          <div className="mt-4 flex items-center justify-between gap-3 px-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">지금 많이 찾는 질문</p>
            <p className="text-xs text-[var(--text-muted)]">클릭하면 바로 시작됩니다</p>
          </div>

          <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {suggestionsLoading
              ? [1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="h-[168px] animate-pulse rounded-[26px] border border-[var(--panel-border)] bg-white/58"
                  />
                ))
              : mergedSuggestions.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => void startChat(question)}
                    disabled={loading}
                    className="surface-soft min-h-[156px] rounded-[26px] p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgba(67,171,212,0.2)] hover:bg-white/92"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      바로 시작
                    </p>
                    <p
                      className="mt-4 text-[17px] leading-8 text-[var(--text-primary)]"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 4,
                        overflow: 'hidden',
                      }}
                    >
                      {question}
                    </p>
                  </button>
                ))}
          </section>
        </div>
      </div>
    </div>
  );
}
