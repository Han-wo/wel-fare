import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://welfare:welfare_pass@localhost:5432/welfare_ai',
  entities: [path.join(__dirname, '../modules/**/entities/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, './migrations/*.{ts,js}')],
  synchronize: false,
  logging: false,
});
