import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PolicyRequirement } from './policy-requirement.entity';

@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  externalId?: string | null;

  @Column()
  source: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ type: 'varchar', nullable: true })
  subcategory?: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider?: string | null;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({ type: 'text', nullable: true })
  targetSummary?: string | null;

  @Column({ type: 'bigint', nullable: true })
  benefitAmount?: number | null;

  @Column({ type: 'varchar', nullable: true })
  benefitType?: string | null;

  @Column({ type: 'date', nullable: true })
  applicationStart?: string | null;

  @Column({ type: 'date', nullable: true })
  applicationEnd?: string | null;

  @Column({ default: 'ACTIVE' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  applyUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact?: string | null;

  @Column({ type: 'text', array: true, nullable: true })
  sidoCodes?: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  rawData?: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  qdrantPointId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  neo4jNodeId?: string | null;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  applyCount: number;

  @OneToMany(() => PolicyRequirement, (req) => req.policy, { cascade: true })
  requirements?: PolicyRequirement[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  syncedAt?: Date | null;
}
