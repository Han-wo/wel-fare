import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DataSyncTrigger = 'MANUAL' | 'CRON' | 'SEED';
export type DataSyncStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

@Entity('data_sync_logs')
export class DataSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  runId: string;

  @Column()
  seedKey: string;

  @Column()
  seedName: string;

  @Column()
  script: string;

  @Column()
  trigger: DataSyncTrigger;

  @Column()
  status: DataSyncStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'integer', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'integer', nullable: true })
  vectorCount?: number | null;

  @Column({ type: 'integer', nullable: true })
  graphCount?: number | null;

  @Column({ type: 'integer', nullable: true })
  skippedCount?: number | null;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @Column({ type: 'text', nullable: true })
  stdout?: string | null;

  @Column({ type: 'text', nullable: true })
  stderr?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
