import { DataSource } from 'typeorm';
import * as path from 'path';

async function syncSchema() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://welfare:welfare_pass@localhost:5432/welfare_ai',
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
