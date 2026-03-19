import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { getRequiredEnv } from '../common/env.util';

async function syncSchema() {
  const ds = new DataSource({
    type: 'postgres',
    url: getRequiredEnv('DATABASE_URL'),
    entities: [path.join(__dirname, '../modules/**/entities/*.entity.{ts,js}')],
    synchronize: false,
    logging: true,
  });

  await ds.initialize();
  console.log('Connected to PostgreSQL. Synchronizing schema...');
  await ds.synchronize();
  console.log('✅ Schema synchronized');
  await ds.destroy();
}

syncSchema().catch((err) => {
  console.error('Schema sync failed:', err);
  process.exit(1);
});
