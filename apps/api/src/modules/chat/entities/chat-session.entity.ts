import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';

export type ChatSessionRuntimeState = 'OPEN' | 'CLOSED';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ name: 'runtime_state', type: 'varchar', length: 16, default: 'CLOSED' })
  runtimeState: ChatSessionRuntimeState;

  @Column({ name: 'active_stream_token', type: 'uuid', nullable: true })
  activeStreamToken?: string | null;

  @Column({ name: 'active_stream_closed', type: 'boolean', default: true })
  activeStreamClosed: boolean;

  @Column({ name: 'active_stream_started_at', type: 'timestamptz', nullable: true })
  activeStreamStartedAt?: Date | null;

  @Column({ name: 'active_stream_closed_at', type: 'timestamptz', nullable: true })
  activeStreamClosedAt?: Date | null;

  @OneToMany(() => ChatMessage, (msg) => msg.session)
  messages?: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
