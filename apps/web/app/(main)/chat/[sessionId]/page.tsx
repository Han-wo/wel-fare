'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Loader2,
  Settings,
} from 'lucide-react';
import { useChat, type ChatThinkPhase } from '../../../../hooks/useChat';
import { MarkdownMessage } from '../../../../components/markdown';
import { BrandMark } from '../../../../components/brand-mark';
import { HitlPanel } from '../../../../components/hitl-panel';
import { formatClockKorean, formatRelativeKoreanTime } from '../../../../lib/datetime';
import { useUserStore } from '../../../../store/user.store';

function ThinkingPhaseCard({
  phases,
  expanded,
  onToggle,
  isStreaming,
}: {
  phases: ChatThinkPhase[];
  expanded: boolean;
  onToggle: () => void;
  isStreaming: boolean;
}) {
  if (phases.length === 0) return null;

  const latest = phases[phases.length - 1];
  const summary =
    latest.content?.trim() ||
    (latest.status === 'done' ? `${latest.phase} 완료` : `${latest.phase} 진행 중`);

  return (
    <div style={{ width: '100%', color: 'var(--text-muted)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 12,
          lineHeight: 1.5,
        }}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span
          className={isStreaming ? 'thinking-phase-pulse' : undefined}
          style={{ fontWeight: 500, color: 'var(--text-primary)' }}
        >
          {isStreaming ? 'Thinking…' : 'Thinking'}
        </span>
        <span>· {summary}</span>
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 8,
            paddingLeft: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {phases.map((phase) => {
            const isActive = phase.status === 'active' && isStreaming;
            return (
              <div key={phase.id}>
                <div
                  className={isActive ? 'thinking-phase-pulse' : undefined}
                  style={{ fontWeight: 500, color: 'var(--text-primary)' }}
                >
                  {phase.phase}
                </div>
                {phase.content && (
                  <div style={{ color: 'var(--text-muted)', wordBreak: 'keep-all' }}>
                    {phase.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChatSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const {
    messages,
    isStreaming,
    isThinking,
    isLoading,
    thinkingPhases,
    thinkingAssistantId,
    activeHitl,
    dismissHitl,
    submitHitlResponse,
    sendMessage,
  } = useChat(sessionId);
  const userName = useUserStore((s) => s.userName);

  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialSent = useRef(false);
  const initialQuestion = searchParams.get('q')?.trim() ?? '';
  const firstThinkPhaseId = thinkingPhases[0]?.id ?? null;

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
    scrollToBottom(messages.length > 0 || thinkingPhases.length > 0 ? 'auto' : 'smooth');
  }, [isThinking, messages.length, scrollToBottom, thinkingPhases.length]);

  useEffect(() => {
    setThinkingExpanded(false);
  }, [firstThinkPhaseId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 200)}px`;
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

  const showStandaloneThinking = thinkingPhases.length > 0 && !thinkingAssistantId;

  const headerTitle = useMemo(() => {
    const firstUser = messages.find((m) => m.role === 'user');
    return firstUser?.content?.slice(0, 40) || initialQuestion.slice(0, 40) || '새 대화';
  }, [initialQuestion, messages]);

  const headerSub = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last?.createdAt) return formatRelativeKoreanTime(last.createdAt);
    return '';
  }, [messages]);

  const initial = (userName ?? '나').charAt(0);

  return (
    <>
      <header
        className="page-header-responsive"
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 500,
              margin: 0,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {headerTitle}
          </h2>
          {headerSub && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {headerSub}
            </p>
          )}
        </div>
        <div className="page-actions-responsive" style={{ display: 'flex', gap: 4 }}>
          <button className="btn-ghost" aria-label="북마크">
            <Bookmark size={14} />
          </button>
          <button className="btn-ghost" aria-label="설정">
            <Settings size={14} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-session-shell-responsive"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px 0',
          position: 'relative',
        }}
      >
        <div
          className="chat-session-inner-responsive"
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '0 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {isLoading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '80px 0',
                fontSize: 14,
                color: 'var(--text-muted)',
              }}
            >
              <Loader2 size={16} className="animate-spin" />
              대화 내역을 불러오는 중입니다
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === 'user';
            const showThinkingAboveMessage =
              !isUser && thinkingPhases.length > 0 && thinkingAssistantId === m.id;

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className="chat-message-track-responsive"
                  style={{
                    width: '100%',
                    maxWidth: 980,
                    display: 'flex',
                    flexDirection: isUser ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 12,
                  }}
                >
                  {isUser ? (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: '#c8d8d0',
                        color: '#2d4a3a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {initial}
                    </div>
                  ) : (
                    <BrandMark />
                  )}
                  <div
                    className={isUser ? 'chat-user-bubble-responsive' : 'chat-assistant-bubble-responsive'}
                    style={{
                      minWidth: 0,
                      maxWidth: isUser ? 'min(100%, 560px)' : 'min(100%, 760px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      gap: showThinkingAboveMessage ? 10 : 0,
                    }}
                  >
                    {showThinkingAboveMessage && (
                      <ThinkingPhaseCard
                        phases={thinkingPhases}
                        expanded={thinkingExpanded}
                        onToggle={() => setThinkingExpanded((prev) => !prev)}
                        isStreaming={isStreaming}
                      />
                    )}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: isUser ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {isUser ? userName ?? '나' : 'welFareAI'}
                      {m.createdAt && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 400,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {formatClockKorean(m.createdAt)}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        width: '100%',
                        borderRadius: 22,
                        padding: isUser ? '14px 18px' : '16px 18px',
                        background: isUser
                          ? 'linear-gradient(135deg, #2f6f63 0%, #3d8578 100%)'
                          : 'var(--bg-surface)',
                        border: isUser ? 'none' : '1px solid var(--border)',
                        boxShadow: isUser ? '0 16px 32px rgba(47, 111, 99, 0.18)' : 'var(--shadow)',
                        color: isUser ? '#f6fbf9' : 'var(--text-primary)',
                        borderBottomRightRadius: isUser ? 8 : 22,
                        borderBottomLeftRadius: isUser ? 22 : 8,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {isUser ? (
                        <p
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            fontSize: 15,
                            lineHeight: 1.7,
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {m.content}
                        </p>
                      ) : (
                        <div className="prose-chat">
                          <MarkdownMessage content={m.content} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {showStandaloneThinking && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                className="chat-message-track-responsive"
                style={{
                  width: '100%',
                  maxWidth: 980,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 12,
                }}
              >
                <BrandMark />
                <div
                  className="chat-assistant-bubble-responsive"
                  style={{
                    width: '100%',
                    maxWidth: 'min(100%, 760px)',
                  }}
                >
                  <ThinkingPhaseCard
                    phases={thinkingPhases}
                    expanded={thinkingExpanded}
                    onToggle={() => setThinkingExpanded((prev) => !prev)}
                    isStreaming={isStreaming || isThinking}
                  />
                </div>
              </div>
            </div>
          )}

          {activeHitl && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                className="chat-message-track-responsive"
                style={{
                  width: '100%',
                  maxWidth: 980,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 12,
                }}
              >
                <BrandMark />
                <HitlPanel
                  questionnaire={activeHitl}
                  onDismiss={dismissHitl}
                  onSubmit={(composed) => {
                    submitHitlResponse(composed);
                  }}
                />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            aria-label="맨 아래로 이동"
            className="btn-secondary"
            style={{
              position: 'absolute',
              bottom: 20,
              right: 24,
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 999,
            }}
          >
            <ArrowDown size={14} />
          </button>
        )}
      </div>

      <div
        className="chat-input-wrap-responsive"
        style={{
          padding: '12px 24px 20px',
          background: 'var(--bg-canvas)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 12,
            boxShadow: 'var(--shadow)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="답변을 이어서 질문해보세요..."
            disabled={isLoading}
            rows={1}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'var(--font)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              background: 'transparent',
              minHeight: 28,
              padding: '2px 4px',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                color: 'var(--text-muted)',
                fontSize: 11,
              }}
            >
              <span className="kbd">⏎</span> 전송 ·{' '}
              <span className="kbd">⇧⏎</span> 줄바꿈
            </div>
            <button
              className="btn-primary"
              style={{ padding: '8px 10px' }}
              aria-label="전송"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
