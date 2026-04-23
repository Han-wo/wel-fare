export type RagThinkStatus = 'active' | 'done';

export interface RagThinkPayload {
  phase: string;
  content?: string;
  node?: string;
  traceId?: string;
  status?: RagThinkStatus;
}
