export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  citedPolicies?: string[];
  tokenCount?: number;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  messages?: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
