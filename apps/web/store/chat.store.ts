import { create } from 'zustand';
import type { ChatSession } from '@welfare-ai/shared-types';

interface ChatStore {
  sessions: ChatSession[];
  currentSessionId: string | null;
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessions: [],
  currentSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) => set({ currentSessionId: id }),
}));
