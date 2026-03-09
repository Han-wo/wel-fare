'use client';
import { useState, useCallback } from 'react';
import type { ChatMessage } from '@welfare-ai/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async (question: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, sessionId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
      ]);

      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const url =
        `${API_BASE}/api/v1/rag/stream?sessionId=${sessionId}&q=${encodeURIComponent(question)}` +
        (token ? `&token=${token}` : '');

      const es = new EventSource(url);

      es.onmessage = (e) => {
        if (e.data === '[DONE]') {
          es.close();
          setIsStreaming(false);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + e.data } : m)),
        );
      };

      es.onerror = () => {
        es.close();
        setIsStreaming(false);
      };
    },
    [sessionId],
  );

  return { messages, isStreaming, sendMessage };
}
