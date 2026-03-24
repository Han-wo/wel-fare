import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfileModule } from './modules/profile/profile.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { RagModule } from './modules/rag/rag.module';
import { ChatModule } from './modules/chat/chat.module';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { DataSyncModule } from './modules/data-sync/data-sync.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
        },
      }),
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: () => ({
        ttl: 60 * 5,
      }),
    }),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    AuthModule,
    UsersModule,
    ProfileModule,
    PoliciesModule,
    RagModule,
    ChatModule,
    CrawlerModule,
    NotificationsModule,
    BookmarksModule,
    DataSyncModule,
  ],
})
export class AppModule {}
