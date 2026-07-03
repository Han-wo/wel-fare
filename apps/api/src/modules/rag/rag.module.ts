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
import { HitlSuggestionService } from './hitl-suggestion.service';
import { NEO4J_DRIVER } from './rag.tokens';
import { RagThinkingStreamService } from './rag-thinking-stream.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Policy } from '../policies/entities/policy.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatModule } from '../chat/chat.module';
import { ProfileModule } from '../profile/profile.module';
import { RagTrace } from './entities/rag-trace.entity';
import { DataSyncLog } from '../data-sync/entities/data-sync-log.entity';
import { RagCacheService } from './rag-cache.service';
import { ROUTE_FALLBACK_CLASSIFIER } from './route-fallback';
import { RouteLlmFallbackService } from './route-llm-fallback.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, Policy, ChatMessage, ChatSession, RagTrace, DataSyncLog]),
    ConfigModule,
    ChatModule,
    ProfileModule,
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
    {
      // 라우팅 LLM 폴백. off이거나 OpenAI 키가 없으면 null → 정규식 단독 동작.
      provide: ROUTE_FALLBACK_CLASSIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get('RAG_ROUTE_LLM_FALLBACK', 'on') !== 'off';
        return enabled && config.get('OPENAI_API_KEY') ? new RouteLlmFallbackService() : null;
      },
    },
    RagService,
    RagOrchestratorService,
    RagTraceService,
    TraceFacade,
    RetrieverServices,
    QueryAnalysisService,
    StreamingService,
    RagThinkingStreamService,
    RagCacheService,
    VectorRetrievalService,
    PolicyGraphService,
    HousingGraphService,
    SuggestionService,
    HitlSuggestionService,
  ],
})
export class RagModule {}
