import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

/**
 * 대화(HITL 보충 답변)에서 확인된 사용자 사실.
 *
 * user_profiles는 사용자가 설정 화면에서 직접 입력한 정형 프로필(birthDate,
 * sidoCode 등)이고, 이 테이블은 채팅에서 자연어로 확인된 값("30대", "서울")을
 * 원문 그대로 보관한다. 형식이 달라 프로필 컬럼에 우겨넣지 않고 분리하며,
 * 세션이 바뀌어도 같은 정보를 재질문하지 않는 데 쓴다.
 */
@Entity('user_profile_facts')
@Unique(['userId', 'field'])
export class UserProfileFact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // region | age | income | housing
  @Column({ type: 'varchar', length: 32 })
  field: string;

  @Column({ type: 'text' })
  value: string;

  // 값의 출처. 현재는 'hitl'만 사용.
  @Column({ type: 'varchar', length: 32, default: 'hitl' })
  source: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
