import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type RagTraceStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED';

export interface RagTraceNode {
  id: string;
  label: string;
  kind: string;
  score?: number | null;
  meta?: unknown;
}

export interface RagTraceEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  meta?: unknown;
}

export interface RagTraceGraph {
  nodes: RagTraceNode[];
  edges: RagTraceEdge[];
}

export interface RagTraceEvent {
  id: string;
  type: 'session' | 'context' | 'decision' | 'vector_search' | 'graph_walk' | 'answer' | 'error';
  title: string;
  detail?: string | null;
  at: string;
  payload?: unknown;
}

@Entity('rag_traces')
export class RagTrace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  answer?: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: RagTraceStatus;

  @Column({ name: 'route_type', type: 'varchar', length: 32, nullable: true })
  routeType?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model?: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  toolNames: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  events: RagTraceEvent[];

  @Column({ type: 'jsonb', default: () => "'{\"nodes\":[],\"edges\":[]}'" })
  graph: RagTraceGraph;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
