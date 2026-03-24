import 'dotenv/config';
import { AppDataSource } from './data-source';

async function run() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
    console.log('Migrations completed');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error('Migration run failed:', error);
  process.exit(1);
});
