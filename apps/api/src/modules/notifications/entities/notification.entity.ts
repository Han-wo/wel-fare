import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ nullable: true })
  policyId?: string;

  @Column({ default: false })
  isRead: boolean;

  // 동일 알림 재발송 방지 키 (예: deadline:{userId}:{policyId}:{dDay})
  @Column({ type: 'varchar', nullable: true, unique: true })
  dedupeKey?: string | null;

  @Column({ nullable: true })
  sentAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
