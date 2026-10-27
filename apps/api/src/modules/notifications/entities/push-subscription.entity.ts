import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 브라우저 웹푸시 구독.
 *
 * 한 사용자가 기기·브라우저마다 다른 구독을 갖는다(노트북 크롬, 폰 사파리 …).
 * 그래서 user당 1행이 아니라 endpoint가 고유키다. 기기를 정리하면 구독이
 * 만료되는데, 발송 시 410/404가 오면 그 행을 지워 자연 정리한다.
 */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  /** 푸시 서비스 엔드포인트. 브라우저가 발급하며 구독의 고유 식별자다. */
  @Index({ unique: true })
  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  /** 어떤 기기에서 구독했는지 — 사용자가 설정에서 구분할 수 있게 남긴다. */
  @Column({ type: 'text', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
