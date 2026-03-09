'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Bot, User, Send, Loader2, ArrowDown } from 'lucide-react';
import { useChat } from '../../../../hooks/useChat';
import { MarkdownMessage } from '../../../../components/markdown';

export default function ChatSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const { messages, isStreaming, sendMessage } = useChat(sessionId);

  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  /* URL 쿼리에 초기 질문이 있으면 자동 전송 */
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !initialSent.current) {
      initialSent.current = true;
      sendMessage(q);
    }
  }, [searchParams, sendMessage]);

  /* 스트리밍 중 자동 스크롤 */
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  /* 스크롤 다운 버튼 */
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };

  const handleSend = () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput('');
    sendMessage(q);
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center text-gray-600 text-sm py-20">
              질문을 입력하면 AI가 맞춤 복지 혜택을 안내합니다
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* 아바타 */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-blue-500 to-violet-600'
                  : 'bg-zinc-800 border border-white/10'
              }`}>
                {msg.role === 'assistant'
                  ? <Bot size={15} className="text-white" />
                  : <User size={15} className="text-gray-300" />
                }
              </div>

              {/* 메시지 버블 */}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-zinc-900 border border-white/5 text-gray-100 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <MarkdownMessage content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}
                  {msg.role === 'assistant' && msg.content === '' && isStreaming && (
                    <span className="inline-flex gap-1 items-center text-gray-500">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 스크롤 다운 버튼 */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-24 right-8 w-9 h-9 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center shadow-lg hover:bg-zinc-700 transition"
        >
          <ArrowDown size={15} className="text-gray-400" />
        </button>
      )}

      {/* 입력창 */}
      <div className="border-t border-white/5 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-zinc-900 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-brand-500/50 transition">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="복지 혜택에 대해 질문하세요... (Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-white outline-none resize-none placeholder:text-gray-600 max-h-32 overflow-y-auto leading-relaxed"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="w-9 h-9 bg-brand-600 hover:bg-brand-700 disabled:bg-zinc-700 disabled:text-gray-500 rounded-xl flex items-center justify-center transition shrink-0"
            >
              {isStreaming
                ? <Loader2 size={16} className="text-white animate-spin" />
                : <Send size={15} className="text-white" />
              }
            </button>
          </div>
          <p className="text-center text-xs text-gray-700 mt-2">
            AI 응답은 참고용입니다. 정확한 신청 조건은 공식 기관에서 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
