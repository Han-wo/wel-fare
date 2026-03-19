import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { traceable } from 'langsmith/traceable';
import { createRagGraph, type RagGraphServices } from './rag.graph';
import { createEligibilityGraph } from './eligibility.graph';
import { createApplicationAssistGraph } from './application-assist.graph';
import { RetrieverServices } from './retriever-services.service';
import { QueryAnalysisService, type RagRouteType } from './query-analysis.service';
import { TraceFacade } from './trace-facade.service';
import { StreamingService, type RagStreamEvent } from './streaming.service';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatRuntimeService } from '../chat/chat-runtime.service';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';

@Injectable()
export class RagOrchestratorService {
  private readonly logger = new Logger(RagOrchestratorService.name);
  private readonly searchGraph: ReturnType<typeof createRagGraph>;
  private readonly eligibilityGraph: ReturnType<typeof createEligibilityGraph>;
  private readonly applicationAssistGraph: ReturnType<typeof createApplicationAssistGraph>;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    private readonly retrievers: RetrieverServices,
    private readonly queryAnalysis: QueryAnalysisService,
    private readonly traceFacade: TraceFacade,
    private readonly streamingService: StreamingService,
    private readonly chatRuntime: ChatRuntimeService,
    private readonly config: ConfigService,
  ) {
    const services: RagGraphServices = {
      queryAnalysis: this.queryAnalysis,
      getProfile: this.retrievers.getProfile.bind(this.retrievers),
      searchWelfare: traceable(this.retrievers.searchWelfare.bind(this.retrievers), {
        name: 'search_welfare',
        run_type: 'retriever',
        tags: ['qdrant', 'neo4j', 'welfare'],
      }),
      searchYouthPolicies: traceable(this.retrievers.searchYouthPolicies.bind(this.retrievers), {
        name: 'search_youth_policy',
        run_type: 'retriever',
        tags: ['qdrant', 'youth'],
      }),
      searchPolicyEligibility: traceable(
        this.retrievers.searchPolicyEligibility.bind(this.retrievers),
        {
          name: 'check_policy_eligibility',
          run_type: 'retriever',
          tags: ['qdrant', 'eligibility'],
        },
      ),
      searchHousingSubscriptions: traceable(
        this.retrievers.searchHousingSubscriptions.bind(this.retrievers),
        {
          name: 'search_housing_subscription',
          run_type: 'retriever',
          tags: ['neo4j', 'qdrant', 'housing-subscription'],
        },
      ),
      searchRentalSupport: traceable(this.retrievers.searchRentalSupport.bind(this.retrievers), {
        name: 'search_rental_support',
        run_type: 'retriever',
        tags: ['neo4j', 'qdrant', 'rental-support'],
      }),
      searchWelfareFacilities: traceable(
        this.retrievers.searchWelfareFacilities.bind(this.retrievers),
        {
          name: 'search_welfare_facility',
          run_type: 'retriever',
          tags: ['qdrant', 'facility'],
        },
      ),
      getUpcomingDeadlines: traceable(this.retrievers.getUpcomingDeadlines.bind(this.retrievers), {
        name: 'get_upcoming_deadlines',
        run_type: 'retriever',
        tags: ['neo4j', 'deadline'],
      }),
      loadHistory: this.loadChatHistory.bind(this),
      saveMessage: this.saveAssistantMessage.bind(this),
      recordContext: this.traceFacade.recordContext.bind(this.traceFacade),
      recordEvent: this.traceFacade.addEvent.bind(this.traceFacade),
      recordToolSelection: this.traceFacade.recordToolSelection.bind(this.traceFacade),
      calcAge,
      getSidoName,
    };

    this.searchGraph = createRagGraph(services);
    this.eligibilityGraph = createEligibilityGraph(services);
    this.applicationAssistGraph = createApplicationAssistGraph(services);
  }

  async *streamAnswer(
    userId: string,
    sessionId: string,
    question: string,
  ): AsyncGenerator<RagStreamEvent> {
    await this.ensureSessionOwnership(userId, sessionId);

    const traceId = this.traceFacade.startTrace({
      sessionId,
      userId,
      question,
      model: this.config.get('OPENAI_CHAT_MODEL', 'gpt-5-mini'),
    });
    const routeDecision = this.queryAnalysis.resolveRoute(question);
    this.traceFacade.setRouteType(traceId, {
      routeType: routeDecision.routeType,
      detail: routeDecision.detail,
    });

    const graph = this.getGraphForRoute(routeDecision.routeType);

    yield* this.streamingService.stream(sessionId, {
      onStart: async () => {
        await this.saveUserMessage(sessionId, question);
      },
      run: async ({ pushText, isClosed }) => {
        const result = await graph.invoke(
          {
            question,
            userId,
            sessionId,
            traceId,
            messages: [],
            profile: null,
            answer: '',
            streamCallback: (token: string) => {
              void isClosed().then((closed) => {
                if (!closed) {
                  void pushText(token);
                }
              });
            },
          },
          {
            runName: 'welfare-rag-pipeline',
            tags: ['welfare-ai', 'rag', 'langgraph'],
            metadata: { userId, sessionId, traceId, routeType: routeDecision.routeType },
          },
        );

        return {
          answer: typeof result?.answer === 'string' ? result.answer : '',
        };
      },
      onSuccess: async ({ answer }) => {
        if (answer) {
          this.traceFacade.recordAnswer(traceId, answer);
        }
        await this.traceFacade.finalizeTrace(traceId, {
          status: 'SUCCESS',
          answer: answer || null,
        });
      },
      onError: async (error) => {
        this.logger.error('RAG 파이프라인 오류:', error);
        this.traceFacade.recordError(traceId, error.message);
        await this.traceFacade.finalizeTrace(traceId, {
          status: 'FAILED',
          error: error.message,
        });
      },
      onAbort: async () => {
        await this.traceFacade.finalizeTrace(traceId, {
          status: 'ABORTED',
        });
      },
    });
  }

  private getGraphForRoute(routeType: RagRouteType) {
    switch (routeType) {
      case 'ELIGIBILITY':
        return this.eligibilityGraph;
      case 'APPLICATION_ASSIST':
        return this.applicationAssistGraph;
      case 'SEARCH':
      default:
        return this.searchGraph;
    }
  }

  private async loadChatHistory(sessionId: string) {
    const messages = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private async saveAssistantMessage(sessionId: string, role: string, content: string) {
    if (role === 'assistant' && !(await this.chatRuntime.isSessionOpen(sessionId))) {
      return;
    }

    await this.persistMessage(sessionId, role, content);
  }

  private async saveUserMessage(sessionId: string, content: string) {
    await this.persistMessage(sessionId, 'user', content, content.slice(0, 60).trim());
  }

  private async persistMessage(
    sessionId: string,
    role: 'user' | 'assistant' | string,
    content: string,
    nextTitle?: string,
  ) {
    await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        session: { id: sessionId } as ChatSession,
        role,
        content,
      }),
    );

    await this.sessionRepo.query(
      `
      UPDATE chat_sessions
      SET "updatedAt" = NOW(),
          title = CASE
            WHEN $1::text IS NOT NULL AND (title IS NULL OR title = '' OR title = '새 대화')
              THEN $1
            ELSE title
          END
      WHERE id = $2
      `,
      [nextTitle ?? null, sessionId],
    );
  }

  private async ensureSessionOwnership(userId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
      select: ['id'],
    });

    if (!session) {
      throw new Error('대화를 찾을 수 없습니다.');
    }
  }
}
