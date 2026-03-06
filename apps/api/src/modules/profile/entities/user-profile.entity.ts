import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ nullable: true })
  sidoCode?: string;

  @Column({ nullable: true })
  sigunguCode?: string;

  @Column({ nullable: true })
  dongName?: string;

  @Column({ nullable: true })
  householdType?: string;

  @Column({ default: 1 })
  householdCount: number;

  @Column({ nullable: true })
  occupationType?: string;

  @Column({ nullable: true })
  employmentMonths?: number;

  @Column({ type: 'bigint', nullable: true })
  annualIncome?: number;

  @Column({ nullable: true })
  incomeBracket?: number;

  @Column({ default: false })
  isHomeowner: boolean;

  @Column({ default: false })
  isDisabled: boolean;

  @Column({ nullable: true })
  disabilityGrade?: number;

  @Column({ default: false })
  isVeteran: boolean;

  @Column({ default: false })
  isSingleParent: boolean;

  @Column({ default: false })
  hasChildren: boolean;

  @Column({ default: 0 })
  childrenCount: number;

  @Column({ default: false })
  isImmigrant: boolean;

  @Column({ nullable: true })
  educationLevel?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
