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

  @Column({ unique: true, nullable: true })
  externalId?: string;

  @Column()
  source: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  subcategory?: string;

  @Column({ nullable: true })
  provider?: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ type: 'text', nullable: true })
  targetSummary?: string;

  @Column({ type: 'bigint', nullable: true })
  benefitAmount?: number;

  @Column({ nullable: true })
  benefitType?: string;

  @Column({ type: 'date', nullable: true })
  applicationStart?: string;

  @Column({ type: 'date', nullable: true })
  applicationEnd?: string;

  @Column({ default: 'ACTIVE' })
  status: string;

  @Column({ nullable: true })
  applyUrl?: string;

  @Column({ nullable: true })
  contact?: string;

  @Column({ type: 'text', array: true, nullable: true })
  sidoCodes?: string[];

  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  rawData?: Record<string, unknown>;

  @Column({ nullable: true })
  qdrantPointId?: string;

  @Column({ nullable: true })
  neo4jNodeId?: string;

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

  @Column({ nullable: true })
  syncedAt?: Date;
}
