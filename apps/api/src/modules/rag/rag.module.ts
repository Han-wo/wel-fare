import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { RagController } from './rag.controller';
import { RagTraceAdminController } from './rag-trace.admin.controller';
import { RagService } from './rag.service';
import { RagOrchestratorService } from './rag-orchestrator.service';
import { RagTraceService } from './rag-trace.service';
import { TraceFacade } from './trace-facade.service';
import { RetrieverServices } from './retriever-services.service';
import { QueryAnalysisService } from './query-analysis.service';
import { StreamingService } from './streaming.service';
import { VectorRetrievalService } from './vector-retrieval.service';
import { PolicyGraphService } from './policy-graph.service';
import { HousingGraphService } from './housing-graph.service';
import { SuggestionService } from './suggestion.service';
import { NEO4J_DRIVER } from './rag.tokens';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatModule } from '../chat/chat.module';
import { RagTrace } from './entities/rag-trace.entity';
import { DataSyncLog } from '../data-sync/entities/data-sync-log.entity';
import { RagCacheService } from './rag-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, ChatMessage, ChatSession, RagTrace, DataSyncLog]),
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
    RagOrchestratorService,
    RagTraceService,
    TraceFacade,
    RetrieverServices,
    QueryAnalysisService,
    StreamingService,
    RagCacheService,
    VectorRetrievalService,
    PolicyGraphService,
    HousingGraphService,
    SuggestionService,
  ],
})
export class RagModule {}
