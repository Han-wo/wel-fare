'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Bot, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';

export default function ChatIndexPage() {
  const router = useRouter();
  const { userName, accessToken } = useUserStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  /* 백엔드에서 프로필 기반 추천 질문 가져오기 (sessionStorage 캐시 5분) */
  useEffect(() => {
    if (!accessToken) return;

    const CACHE_KEY = 'suggestions_cache';
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, expiresAt } = JSON.parse(cached) as { data: string[]; expiresAt: number };
        if (expiresAt > Date.now()) {
          setSuggestions(data);
          setSuggestionsLoading(false);
          return;
        }
      } catch { /* ignore */ }
    }

    setSuggestionsLoading(true);
    api<string[]>('/rag/suggestions')
      .then((data) => {
        setSuggestions(data);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, expiresAt: Date.now() + 5 * 60 * 1000 }));
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [accessToken]);

  const startChat = async (question?: string) => {
    const q = question ?? input.trim();
    if (!q) return;
    setLoading(true);
    try {
      const session = await api<{ id: string }>('/chat/sessions', {
        method: 'POST',
        body: { title: q.slice(0, 40) },
      });
      router.push(`/chat/${session.id}?q=${encodeURIComponent(q)}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-12 bg-[#09090b]">
      <div className="w-full max-w-2xl">
        {/* 환영 메시지 */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            안녕하세요, {userName ?? ''}님! 👋
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            내 조건에 맞는 복지 혜택을 AI가 찾아드립니다.<br />
            <span className="text-blue-400">프로필 정보를 기반으로</span> 맞춤 혜택을 추천합니다.
          </p>
        </div>

        {/* 입력창 */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-1 shadow-xl shadow-black/40 mb-6 focus-within:border-brand-500/50 transition">
          <div className="flex items-center gap-3 px-4 py-3">
            <Bot size={18} className="text-blue-400 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && startChat()}
              placeholder="복지 혜택에 대해 자유롭게 질문하세요..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-600"
              disabled={loading}
            />
            <button
              onClick={() => startChat()}
              disabled={!input.trim() || loading}
              className="shrink-0 bg-brand-600 hover:bg-brand-700 disabled:bg-zinc-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-xl transition font-medium flex items-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            </button>
          </div>
        </div>

        {/* 맞춤 추천 질문 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-white/5" />
            <p className="text-xs text-gray-600 px-2">
              {suggestionsLoading ? '추천 질문 불러오는 중...' : '내 프로필 맞춤 추천 질문'}
            </p>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {suggestionsLoading ? (
            <div className="grid grid-cols-1 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 bg-zinc-900/50 border border-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => startChat(q)}
                  disabled={loading}
                  className="text-left px-4 py-3 rounded-xl bg-zinc-900 border border-white/5 hover:border-white/15 hover:bg-zinc-800 text-sm text-gray-300 hover:text-white transition group flex items-center justify-between"
                >
                  <span>{q}</span>
                  <ArrowRight size={14} className="text-gray-600 group-hover:text-gray-400 shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
