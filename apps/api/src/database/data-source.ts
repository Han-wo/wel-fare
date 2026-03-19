import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { getRequiredEnv } from '../common/env.util';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: getRequiredEnv('DATABASE_URL'),
  entities: [path.join(__dirname, '../modules/**/entities/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, './migrations/*.{ts,js}')],
  synchronize: false,
  logging: false,
});
