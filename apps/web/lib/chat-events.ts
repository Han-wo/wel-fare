export const CHAT_SESSIONS_UPDATED = 'chat-sessions-updated';
export const CHAT_SESSION_CLOSE_REQUESTED = 'chat-session-close-requested';

export function emitChatSessionsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_SESSIONS_UPDATED));
}

export function emitChatSessionCloseRequested(sessionId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_SESSION_CLOSE_REQUESTED, { detail: sessionId }));
}
