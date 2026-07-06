import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Policy } from './policy.entity';

@Entity('policy_requirements')
export class PolicyRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  policyId: string;

  @ManyToOne(() => Policy, (policy) => policy.requirements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'policy_id' })
  policy: Policy;

  @Column()
  reqType: string;

  @Column({ type: 'varchar', nullable: true })
  operator?: string | null;

  @Column({ type: 'numeric', nullable: true })
  minValue?: number | null;

  @Column({ type: 'numeric', nullable: true })
  maxValue?: number | null;

  @Column({ type: 'text', array: true, nullable: true })
  valueList?: string[] | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
