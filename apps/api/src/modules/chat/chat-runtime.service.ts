import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type ActiveStreamState = {
  token: string;
  closed: boolean;
  wake?: () => void;
};

type SessionRuntimeState = {
  isOpen: boolean;
  stream?: ActiveStreamState;
};

@Injectable()
export class ChatRuntimeService {
  private readonly sessions = new Map<string, SessionRuntimeState>();

  openSession(sessionId: string) {
    const state = this.sessions.get(sessionId) ?? { isOpen: false };
    state.isOpen = true;
    this.sessions.set(sessionId, state);
    return { id: sessionId, state: 'OPEN' as const };
  }

  closeSession(sessionId: string) {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return { id: sessionId, state: 'CLOSED' as const };
    }

    state.isOpen = false;
    if (state.stream) {
      state.stream.closed = true;
      state.stream.wake?.();
    } else {
      this.sessions.delete(sessionId);
    }

    return { id: sessionId, state: 'CLOSED' as const };
  }

  isSessionOpen(sessionId: string) {
    return this.sessions.get(sessionId)?.isOpen ?? false;
  }

  startStream(sessionId: string) {
    const state = this.sessions.get(sessionId) ?? { isOpen: false };
    const stream: ActiveStreamState = {
      token: randomUUID(),
      closed: false,
    };

    state.isOpen = true;
    state.stream = stream;
    this.sessions.set(sessionId, state);

    return stream.token;
  }

  setWakeHandler(sessionId: string, token: string, wake?: () => void) {
    const stream = this.sessions.get(sessionId)?.stream;
    if (!stream || stream.token !== token) return;
    stream.wake = wake;
  }

  isStreamClosed(sessionId: string, token: string) {
    const stream = this.sessions.get(sessionId)?.stream;
    return !stream || stream.token !== token || stream.closed;
  }

  finishStream(sessionId: string, token: string) {
    const state = this.sessions.get(sessionId);
    if (!state?.stream || state.stream.token !== token) return;

    state.stream = undefined;
    if (!state.isOpen) {
      this.sessions.delete(sessionId);
    }
  }
}
