import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ChatSession, (session) => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;

  @Column()
  role: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'uuid', array: true, nullable: true })
  citedPolicies?: string[];

  @Column({ type: 'jsonb', nullable: true })
  ragContext?: Record<string, unknown>;

  @Column({ nullable: true })
  tokenCount?: number;

  @CreateDateColumn()
  createdAt: Date;
}
