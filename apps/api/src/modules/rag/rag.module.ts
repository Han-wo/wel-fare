import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { RagController } from './rag.controller';
import { RagTraceAdminController } from './rag-trace.admin.controller';
import { RagService, NEO4J_DRIVER } from './rag.service';
import { RagTraceService } from './rag-trace.service';
import { RagRouterService } from './rag-router.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatModule } from '../chat/chat.module';
import { RagTrace } from './entities/rag-trace.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, ChatMessage, ChatSession, RagTrace]),
    ConfigModule,
    ChatModule,
  ],
  controllers: [RagController, RagTraceAdminController],
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        neo4j.driver(
          config.get('NEO4J_URI', 'bolt://localhost:7687'),
          neo4j.auth.basic(
            config.get('NEO4J_USERNAME', 'neo4j'),
            config.getOrThrow<string>('NEO4J_PASSWORD'),
          ),
        ),
    },
    RagService,
    RagTraceService,
    RagRouterService,
  ],
})
export class RagModule {}
