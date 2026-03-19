'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowDown, Bot, Loader2, Send, User } from 'lucide-react';
import { useChat } from '../../../../hooks/useChat';
import { MarkdownMessage } from '../../../../components/markdown';
import { formatClockKorean } from '../../../../lib/datetime';

const STARTER_PROMPTS = [
  '내 조건에서 지금 신청 가능한 주거 지원 찾아줘',
  '청년 정책 중 마감 임박한 것만 보여줘',
  '복지시설이나 돌봄 지원도 같이 찾아줘',
];

export default function ChatSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const { messages, isStreaming, isThinking, isLoading, sendMessage } = useChat(sessionId);

  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialSent = useRef(false);

  useEffect(() => {
    const question = searchParams.get('q');
    if (question && !initialSent.current && !isLoading) {
      initialSent.current = true;
      void sendMessage(question);
    }
  }, [isLoading, searchParams, sendMessage]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : behavior });
  }, []);

  useEffect(() => {
    scrollToBottom(messages.length > 0 ? 'auto' : 'smooth');
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 48), 220)}px`;
  }, [input]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setShowScrollBtn(element.scrollHeight - element.scrollTop - element.clientHeight > 220);
  };

  const handleSend = () => {
    const question = input.trim();
    if (!question || isStreaming) return;
    setInput('');
    void sendMessage(question);
  };

  return (
    <div className="relative flex h-full flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              대화 내역을 불러오는 중입니다
            </div>
          )}

          {!isLoading && messages.length === 0 && !isStreaming && (
            <div>
              <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">추천 질문</p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((question) => (
                  <button key={question} onClick={() => void sendMessage(question)} className="badge-soft">
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isAssistant = message.role === 'assistant';

            return (
              <div key={message.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                <div className={`${isAssistant ? 'max-w-[88%]' : 'w-auto max-w-[72%]'}`}>
                  <div className="mb-2 flex items-center gap-2 px-1 text-xs text-[var(--text-muted)]">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        isAssistant
                          ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                          : 'bg-[#e8edf4] text-[var(--text-secondary)]'
                      }`}
                    >
                      {isAssistant ? <Bot size={13} /> : <User size={13} />}
                    </span>
                    <span>{isAssistant ? '복지 안내' : '내 질문'}</span>
                    {message.createdAt ? <span>{formatClockKorean(message.createdAt)}</span> : null}
                  </div>

                  <div
                    className={`inline-block max-w-full rounded-[28px] border px-5 py-4 text-sm leading-7 ${
                      isAssistant
                        ? 'border-[var(--panel-border)] bg-white/82 text-[var(--text-primary)] shadow-[0_10px_26px_rgba(20,31,45,0.05)]'
                        : 'border-transparent bg-[linear-gradient(135deg,#2f6f5b,#487a67)] text-[#f9f6ef]'
                    }`}
                  >
                    {isAssistant ? (
                      <MarkdownMessage content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="flex justify-start">
              <div className="w-auto max-w-[88%]">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs text-[var(--text-muted)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                    <Bot size={13} />
                  </span>
                  <span>복지 안내</span>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--panel-border)] bg-white/82 px-4 py-3 text-[var(--text-muted)] shadow-[0_8px_18px_rgba(20,31,45,0.04)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom()}
          aria-label="맨 아래로 이동"
          className="absolute bottom-32 right-6 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--panel-border)] bg-white/92 text-[var(--text-secondary)] shadow-lg transition hover:bg-white hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.22)]"
        >
          <ArrowDown size={16} />
        </button>
      )}

      <div className="border-t border-[var(--panel-border)] bg-[rgba(244,239,230,0.82)] px-6 py-4 backdrop-blur md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-[26px] border border-[var(--panel-border)] bg-white/86 px-4 py-3 shadow-[0_14px_32px_rgba(20,31,45,0.05)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="질문을 입력하세요"
              rows={1}
              className="flex-1 resize-none overflow-y-auto bg-transparent py-[11px] text-[15px] leading-6 text-[var(--text-primary)] focus-visible:outline-none"
              style={{ minHeight: 48 }}
              disabled={isLoading}
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="button-primary h-11 w-11 shrink-0 rounded-2xl px-0 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isStreaming ? '응답 생성 중' : '메시지 전송'}
            >
              {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
