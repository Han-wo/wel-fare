'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@welfare-ai/shared-types';
import { createParser, type ParsedEvent } from 'eventsource-parser';
import { api, fetchWithAuth } from '../lib/api';
import {
  CHAT_SESSION_CLOSE_REQUESTED,
  emitChatSessionsUpdated,
} from '../lib/chat-events';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export type HitlChoice = {
  id: string;
  label: string;
  description?: string;
};

export type HitlQuestion = {
  id: string;
  fieldKey: string;
  prompt: string;
  choices: HitlChoice[];
  allowCustom: boolean;
  allowSkip: boolean;
};

export type HitlQuestionnaire = {
  id: string;
  reason: 'missing_profile' | 'empty_retrieval' | 'low_relevance' | 'ambiguous_intent';
  detail: string;
  questions: HitlQuestion[];
};

type StreamPayload =
  | { eventType: 'SESSION_CREATED'; sessionId: string }
  | { eventType: 'THINK' }
  | {
      eventType: 'THINK_DETAIL';
      payload: {
        phase: string;
        content?: string;
        node?: string;
        traceId?: string;
        status?: 'active' | 'done';
      };
    }
  | { eventType: 'TOKEN'; content: string }
  | { eventType: 'HITL'; payload: HitlQuestionnaire }
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

export interface ChatThinkPhase {
  id: string;
  phase: string;
  content?: string;
  node?: string;
  traceId?: string;
  status: 'active' | 'done';
  createdAt: string;
}

function mergeMessages(serverMessages: ChatMessage[], localMessages: ChatMessage[]) {
  if (localMessages.length === 0) return serverMessages;

  const merged = [...serverMessages];

  for (const message of localMessages) {
    const exists = merged.some(
      (serverMessage) =>
        serverMessage.role === message.role && serverMessage.content === message.content,
    );
    if (!exists) {
      merged.push(message);
    }
  }

  return merged.sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [thinkingPhases, setThinkingPhases] = useState<ChatThinkPhase[]>([]);
  const [thinkingAssistantId, setThinkingAssistantId] = useState<string | null>(null);
  const [activeHitl, setActiveHitl] = useState<HitlQuestionnaire | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const optimisticMessagesRef = useRef<ChatMessage[]>([]);

  const resetStreamState = useCallback(() => {
    abortRef.current = null;
    assistantIdRef.current = null;
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  const appendThinkPhase = useCallback(
    (payload: {
      phase?: string;
      content?: string;
      node?: string;
      traceId?: string;
      status?: 'active' | 'done';
    }) => {
      const phase = payload.phase?.trim() || '생각 중';
      const content = payload.content?.trim();
      const node = payload.node?.trim();
      const status = payload.status ?? 'active';

      setThinkingPhases((prev) => {
        const last = prev[prev.length - 1];
        if (
          last &&
          last.phase === phase &&
          last.content === content &&
          last.node === node &&
          last.status === status
        ) {
          return prev;
        }

        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            phase,
            content,
            node,
            traceId: payload.traceId,
            status,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    },
    [],
  );

  const finalizeThinking = useCallback(() => {
    setThinkingPhases((prev) =>
      prev.map((phase) =>
        phase.status === 'active' ? { ...phase, status: 'done' } : phase,
      ),
    );
  }, []);

  const closeStream = useCallback(() => {
    abortRef.current?.abort();
    resetStreamState();
  }, [resetStreamState]);

  const appendAssistantChunk = useCallback((chunk: string) => {
    if (!chunk) return;

    setMessages((prev) => {
      if (!assistantIdRef.current) {
        const nextAssistantId = crypto.randomUUID();
        assistantIdRef.current = nextAssistantId;
        setThinkingAssistantId(nextAssistantId);
        return [
          ...prev,
          {
            id: nextAssistantId,
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
    setThinkingPhases([]);
    setThinkingAssistantId(null);
    setActiveHitl(null);
    optimisticMessagesRef.current = [];

    api<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
      .then((serverMessages) =>
        setMessages(mergeMessages(serverMessages, optimisticMessagesRef.current)),
      )
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

      optimisticMessagesRef.current = [...optimisticMessagesRef.current, userMsg];
      setMessages((prev) => [...prev, userMsg]);
      setThinkingPhases([
        {
          id: crypto.randomUUID(),
          phase: '질문 분석',
          content: '질문을 읽고 적절한 검색 경로를 준비하는 중입니다.',
          node: 'question',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ]);
      setThinkingAssistantId(null);
      setActiveHitl(null);
      setIsStreaming(true);
      setIsThinking(true);
      emitChatSessionsUpdated();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetchWithAuth(
          `${API_BASE}/api/v1/rag/stream?sessionId=${encodeURIComponent(sessionId)}&q=${encodeURIComponent(trimmed)}`,
          {
            method: 'GET',
            signal: controller.signal,
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
              finalizeThinking();
              resetStreamState();
              emitChatSessionsUpdated();
            },
            think: (payload) => {
              setIsThinking(true);
              appendThinkPhase(payload ?? { phase: '생각 중', content: '답변을 준비하는 중입니다.' });
            },
            token: (content) => {
              setIsThinking(false);
              appendAssistantChunk(content);
            },
            hitl: (payload) => {
              setActiveHitl(payload);
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
          finalizeThinking();
          resetStreamState();
          emitChatSessionsUpdated();
        }
      } catch {
        if (!controller.signal.aborted) {
          finalizeThinking();
          closeStream();
          emitChatSessionsUpdated();
        }
      }
    },
    [
      appendAssistantChunk,
      appendThinkPhase,
      closeStream,
      finalizeThinking,
      isLoading,
      isStreaming,
      resetStreamState,
      sessionId,
    ],
  );

  const dismissHitl = useCallback(() => {
    setActiveHitl(null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.warn('[useChat] activeHitl change', activeHitl);
  }, [activeHitl]);

  return {
    messages,
    isStreaming,
    isThinking,
    isLoading,
    thinkingPhases,
    thinkingAssistantId,
    activeHitl,
    dismissHitl,
    sendMessage,
  };
}

function handleStreamEvent(
  event: ParsedEvent,
  callbacks: {
    onSessionCreated: (sessionId: string) => void;
    think: (payload?: {
      phase?: string;
      content?: string;
      node?: string;
      traceId?: string;
      status?: 'active' | 'done';
    }) => void;
    token: (content: string) => void;
    hitl: (payload: HitlQuestionnaire) => void;
    finish: () => void;
    appendAssistantChunk: (chunk: string) => void;
  },
) {
  const payload = parseStreamPayload(event.data);
  if (!payload) return;

  // eslint-disable-next-line no-console
  console.warn('[stream]', payload.eventType);

  if (payload.eventType === 'SESSION_CREATED') {
    callbacks.onSessionCreated(payload.sessionId);
    return;
  }

  if (payload.eventType === 'THINK') {
    callbacks.think({ phase: '생각 중', content: '질문을 처리하는 중입니다.' });
    return;
  }

  if (payload.eventType === 'THINK_DETAIL') {
    callbacks.think(payload.payload);
    return;
  }

  if (payload.eventType === 'HITL') {
    // eslint-disable-next-line no-console
    console.warn('[HITL] received', payload.payload);
    callbacks.hitl(payload.payload);
    return;
  }

  if (payload.eventType === 'TOKEN') {
    const structured = parseStructuredTokenContent(payload.content);
    if (structured?.type === 'think') {
      callbacks.think({
        phase: structured.phase,
        content: structured.content,
        node: structured.node,
      });
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
