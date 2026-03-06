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

  @Column({ nullable: true })
  operator?: string;

  @Column({ type: 'numeric', nullable: true })
  minValue?: number;

  @Column({ type: 'numeric', nullable: true })
  maxValue?: number;

  @Column({ type: 'text', array: true, nullable: true })
  valueList?: string[];

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;
}
