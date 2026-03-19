'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@welfare-ai/shared-types';
import { createParser, type ParsedEvent } from 'eventsource-parser';
import { api } from '../lib/api';
import {
  CHAT_SESSION_CLOSE_REQUESTED,
  emitChatSessionsUpdated,
} from '../lib/chat-events';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type StreamPayload =
  | { eventType: 'SESSION_CREATED'; sessionId: string }
  | { eventType: 'THINK' }
  | { eventType: 'TOKEN'; content: string }
  | { eventType: 'DONE' };

type StructuredTokenContent =
  | { type: 'think'; phase?: string; content?: string; node?: string }
  | { type: 'info'; trace_id?: string; session_id?: string }
  | { type: 'text'; content?: string };

function parseStreamPayload(raw: string): StreamPayload | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StreamPayload;
  } catch {
    return null;
  }
}

function parseStructuredTokenContent(raw: string): StructuredTokenContent | null {
  if (!raw || raw[0] !== '{') return null;

  try {
    return JSON.parse(raw) as StructuredTokenContent;
  } catch {
    return null;
  }
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  const resetStreamState = useCallback(() => {
    abortRef.current = null;
    assistantIdRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  const closeStream = useCallback(() => {
    abortRef.current?.abort();
    resetStreamState();
  }, [resetStreamState]);

  const appendAssistantChunk = useCallback((chunk: string) => {
    if (!chunk) return;

    setMessages((prev) => {
      if (!assistantIdRef.current) {
        assistantIdRef.current = crypto.randomUUID();
        return [
          ...prev,
          {
            id: assistantIdRef.current,
            sessionId,
            role: 'assistant',
            content: chunk,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      const hasAssistant = prev.some((message) => message.id === assistantIdRef.current);
      if (!hasAssistant) {
        return [
          ...prev,
          {
            id: assistantIdRef.current,
            sessionId,
            role: 'assistant',
            content: chunk,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      return prev.map((message) =>
        message.id === assistantIdRef.current
          ? { ...message, content: message.content + chunk }
          : message,
      );
    });
  }, [sessionId]);

  useEffect(() => {
    closeStream();
    setIsLoading(true);

    api<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setIsLoading(false));
  }, [closeStream, sessionId]);

  useEffect(() => {
    void api(`/chat/sessions/${sessionId}/open`, { method: 'POST' }).catch(() => undefined);

    const onCloseRequested = (event: Event) => {
      const requestedSessionId = (event as CustomEvent<string>).detail;
      if (requestedSessionId !== sessionId) return;
      closeStream();
    };

    window.addEventListener(CHAT_SESSION_CLOSE_REQUESTED, onCloseRequested);

    return () => {
      window.removeEventListener(CHAT_SESSION_CLOSE_REQUESTED, onCloseRequested);
      closeStream();
      void api(`/chat/sessions/${sessionId}/close`, { method: 'POST' }).catch(() => undefined);
    };
  }, [closeStream, sessionId]);

  const sendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming || isLoading) return;

      closeStream();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setIsThinking(true);
      emitChatSessionsUpdated();

      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/rag/stream?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(trimmed)}`,
          {
            method: 'GET',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
            credentials: 'include',
            cache: 'no-store',
          },
        );

        if (!response.ok || !response.body) {
          throw new Error(`stream_failed_${response.status}`);
        }

        let doneSeen = false;
        const decoder = new TextDecoder();
        const parser = createParser((event) => {
          if (event.type !== 'event') return;

          handleStreamEvent(event, {
            appendAssistantChunk,
            onSessionCreated: () => {
              emitChatSessionsUpdated();
            },
            finish: () => {
              doneSeen = true;
              resetStreamState();
              emitChatSessionsUpdated();
            },
            think: () => setIsThinking(true),
            token: (content) => {
              setIsThinking(false);
              appendAssistantChunk(content);
            },
          });
        });

        const reader = response.body.getReader();

        while (!doneSeen) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }

        if (!controller.signal.aborted) {
          resetStreamState();
          emitChatSessionsUpdated();
        }
      } catch {
        if (!controller.signal.aborted) {
          closeStream();
          emitChatSessionsUpdated();
        }
      }
    },
    [appendAssistantChunk, closeStream, isLoading, isStreaming, resetStreamState, sessionId],
  );

  return { messages, isStreaming, isThinking, isLoading, sendMessage };
}

function handleStreamEvent(
  event: ParsedEvent,
  callbacks: {
    onSessionCreated: (sessionId: string) => void;
    think: () => void;
    token: (content: string) => void;
    finish: () => void;
    appendAssistantChunk: (chunk: string) => void;
  },
) {
  const payload = parseStreamPayload(event.data);
  if (!payload) return;

  if (payload.eventType === 'SESSION_CREATED') {
    callbacks.onSessionCreated(payload.sessionId);
    return;
  }

  if (payload.eventType === 'THINK') {
    callbacks.think();
    return;
  }

  if (payload.eventType === 'TOKEN') {
    const structured = parseStructuredTokenContent(payload.content);
    if (structured?.type === 'think') {
      callbacks.think();
      return;
    }

    if (structured?.type === 'info') {
      return;
    }

    if (structured?.type === 'text' && structured.content) {
      callbacks.token(structured.content);
      return;
    }

    callbacks.token(payload.content);
    return;
  }

  if (payload.eventType === 'DONE') {
    callbacks.finish();
  }
}
