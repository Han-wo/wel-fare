import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { RagController } from './rag.controller';
import { RagService, NEO4J_DRIVER } from './rag.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserProfile, ChatMessage]), ConfigModule],
  controllers: [RagController],
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        neo4j.driver(
          config.get('NEO4J_URI', 'bolt://localhost:7687'),
          neo4j.auth.basic(
            config.get('NEO4J_USERNAME', 'neo4j'),
            config.get('NEO4J_PASSWORD', 'welfare_neo4j_pass'),
          ),
        ),
    },
    RagService,
  ],
})
export class RagModule {}
