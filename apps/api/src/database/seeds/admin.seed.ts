/**
 * 관리자 계정 시드
 * pnpm db:seed:admin
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { getRequiredEnv } from '../../common/env.util';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: getRequiredEnv('DATABASE_URL'),
  synchronize: true,
  entities: [__dirname + '/../../modules/**/entities/*.entity.ts'],
  logging: false,
});

async function main() {
  await AppDataSource.initialize();

  const ADMIN_EMAIL = getRequiredEnv('ADMIN_EMAIL');
  const ADMIN_PASSWORD = getRequiredEnv('ADMIN_PASSWORD');
  const ADMIN_NAME = '관리자';

  const userRepo = AppDataSource.getRepository('users');
  const profileRepo = AppDataSource.getRepository('user_profiles');

  const existing = await userRepo.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`✅ 관리자 계정이 이미 존재합니다: ${ADMIN_EMAIL}`);
    await AppDataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = userRepo.create({
    email: ADMIN_EMAIL,
    passwordHash,
    name: ADMIN_NAME,
    role: 'ADMIN',
    isVerified: true,
  });
  const saved = await userRepo.save(admin);

  await profileRepo.save(
    profileRepo.create({
      userId: saved.id,
      birthDate: '1990-01-01',
      gender: 'OTHER',
      sidoCode: '11',
      sigunguCode: '11000',
      householdType: 'SINGLE',
      householdCount: 1,
      occupationType: 'EMPLOYEE',
      incomeBracket: 200,
      isHomeowner: false,
    }),
  );

  console.log('🎉 관리자 계정 생성 완료');
  console.log(`   이메일: ${ADMIN_EMAIL}`);
  console.log(`   비밀번호: ${ADMIN_PASSWORD}`);
  console.log('   ⚠️  첫 로그인 후 비밀번호를 변경하세요.');

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
