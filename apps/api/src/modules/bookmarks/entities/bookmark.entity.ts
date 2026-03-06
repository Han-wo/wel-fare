import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('bookmarks')
@Unique(['userId', 'policyId'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  policyId: string;

  @Column({ default: 'SAVED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  memo?: string;

  @Column({ nullable: true })
  appliedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
