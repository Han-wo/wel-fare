import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { traceable } from 'langsmith/traceable';
import { Command, type BaseCheckpointSaver } from '@langchain/langgraph';
import { type RagGraphServices } from './rag.graph';
import {
  buildRagGraphs,
  DEFAULT_ROUTE,
  type InvokableRagGraph,
} from './graph-registry';
import { RetrieverServices } from './retriever-services.service';
import {
  QueryAnalysisService,
  type RagRouteDecision,
  type RagRouteType,
} from './query-analysis.service';
import type { RouteTier } from './route-fallback';
import {
  extractFactsFromAnswers,
  extractPendingHitl,
  parseStructuredHitlAnswers,
  resolveHitlResume,
  resolveHitlResumeFromAnswers,
} from './hitl-resume';
import { parseSupplementFacts } from './profile-facts';
import { ProfileFactsService } from '../profile/profile-facts.service';
import { TraceFacade } from './trace-facade.service';
import { QuestionCondenserService } from './question-condenser.service';
import { StreamingService, type RagStreamEvent } from './streaming.service';
import { RagThinkingStreamService } from './rag-thinking-stream.service';
import { RagAnswerStreamService, type AnswerStreamEmitters } from './rag-answer-stream.service';
import { RAG_CHECKPOINTER } from './rag.tokens';
import type { HitlResumeValue } from './hitl-interrupt';
import { HitlSuggestionService } from './hitl-suggestion.service';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatRuntimeService } from '../chat/chat-runtime.service';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import type { RagThinkPayload } from './thinking.types';
import type { HitlQuestionnaire } from './hitl.types';

@Injectable()
export class RagOrchestratorService {
  private readonly logger = new Logger(RagOrchestratorService.name);
  private readonly graphs: Map<RagRouteType, InvokableRagGraph>;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    private readonly retrievers: RetrieverServices,
    private readonly queryAnalysis: QueryAnalysisService,
    private readonly traceFacade: TraceFacade,
    private readonly streamingService: StreamingService,
    private readonly thinkingStream: RagThinkingStreamService,
    private readonly chatRuntime: ChatRuntimeService,
    private readonly config: ConfigService,
    private readonly hitlSuggestion: HitlSuggestionService,
    private readonly profileFacts: ProfileFactsService,
    private readonly questionCondenser: QuestionCondenserService,
    private readonly answerStream: RagAnswerStreamService,
    @Inject(RAG_CHECKPOINTER)
    private readonly checkpointer: BaseCheckpointSaver,
  ) {
    const services: RagGraphServices = {
      queryAnalysis: this.queryAnalysis,
      hitlSuggestion: this.hitlSuggestion,
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
      saveMessage: this.saveAssistantMessage.bind(this) as RagGraphServices['saveMessage'],
      recordContext: this.traceFacade.recordContext.bind(this.traceFacade),
      recordEvent: this.traceFacade.addEvent.bind(this.traceFacade),
      recordToolSelection: this.traceFacade.recordToolSelection.bind(this.traceFacade),
      emitThink: this.thinkingStream.emit.bind(this.thinkingStream),
      emitToken: this.answerStream.emitToken.bind(this.answerStream),
      emitHitl: this.answerStream.emitHitl.bind(this.answerStream),
      calcAge,
      getSidoName,
    };

    this.graphs = buildRagGraphs(services, this.checkpointer);
  }

  async *streamAnswer(
    userId: string,
    sessionId: string,
    question: string,
    hitlAnswersRaw?: string,
  ): AsyncGenerator<RagStreamEvent> {
    await this.ensureSessionOwnership(userId, sessionId);

    const traceId = this.traceFacade.startTrace({
      sessionId,
      userId,
      question,
      model: this.config.get('OPENAI_CHAT_MODEL', 'gpt-5-mini'),
    });
    // 직전 턴이 HITL 클래리피케이션으로 끝났고 이번 메시지가 그 보충 답변이면,
    // 재라우팅하지 않고 원래 질문·라우트를 복원해 이어서 실행한다.
    // 구조화 답변(hitl 파라미터)이 있으면 결정적으로 처리하고, 없으면
    // 합성 문형 역파싱(구클라이언트 폴백)을 탄다.
    const pendingHitl = await this.loadPendingHitl(sessionId);
    const structuredAnswers = parseStructuredHitlAnswers(hitlAnswersRaw);
    const resume = structuredAnswers
      ? resolveHitlResumeFromAnswers(pendingHitl, structuredAnswers)
      : resolveHitlResume(pendingHitl, question);

    let routeDecision: RagRouteDecision & { tier: RouteTier };
    let effectiveQuestion = question;

    if (resume) {
      effectiveQuestion = resume.effectiveQuestion;
      routeDecision = {
        routeType: resume.routeType,
        detail: resume.skipped
          ? 'HITL 재질문을 건너뛰어 원래 질문을 기존 정보로 재개합니다.'
          : `HITL 보충 답변을 반영해 원래 질문을 재개합니다: ${resume.supplement}`,
        tier: 'hitl_resume',
      };
      this.traceFacade.addEvent(traceId, {
        type: 'decision',
        title: 'HITL 재개',
        detail: routeDecision.detail,
        payload: {
          originalQuestion: pendingHitl?.originalQuestion,
          supplement: resume.supplement,
          skipped: resume.skipped,
          routeType: resume.routeType,
          pendingSource: pendingHitl?.source,
        },
      });

      // 보충 답변의 나이대/지역/소득/주거는 세션을 넘어 재사용하도록 승격한다.
      // 구조화 답변이면 맵에서 직접, 아니면 문자열 파싱으로 추출한다.
      // 저장 실패는 이번 턴 답변에 영향을 주지 않는다(다음 세션에 재질문될 뿐).
      if (resume.supplement) {
        const facts = structuredAnswers
          ? extractFactsFromAnswers(structuredAnswers)
          : parseSupplementFacts(resume.supplement);
        if (Object.keys(facts).length > 0) {
          try {
            await this.profileFacts.upsertMany(userId, facts, { source: 'hitl', sessionId });
          } catch (error) {
            this.logger.warn(`프로필 사실 저장 실패: ${(error as Error).message}`);
          }
        }
      }
    } else {
      // 후속 질문("두 번째 거 조건은?")은 대화 맥락 없이 라우팅·검색하면 빗나간다.
      // 지시어가 감지되면 독립형 질문으로 재작성한 뒤 그 질문으로 진행한다.
      // 재작성 실패·시간 초과는 원 질문 유지 (기존 동작 대비 후퇴 없음).
      const history = await this.loadChatHistory(sessionId);
      const condensed = await this.questionCondenser.condense(question, history);
      if (condensed) {
        effectiveQuestion = condensed;
        this.traceFacade.addEvent(traceId, {
          type: 'decision',
          title: '후속 질문 재작성',
          detail: `대화 맥락을 반영해 독립형 질문으로 재작성했습니다: ${condensed}`,
          payload: { original: question, condensed },
        });
      }
      routeDecision = await this.queryAnalysis.resolveRouteSmart(effectiveQuestion);
    }

    this.traceFacade.setRouteType(traceId, {
      routeType: routeDecision.routeType,
      detail: `[${routeDecision.tier}] ${routeDecision.detail}`,
    });

    const graph = this.getGraphForRoute(routeDecision.routeType);

    yield* this.streamingService.stream(sessionId, {
      onStart: async () => {
        await this.saveUserMessage(sessionId, question);
      },
      run: async ({ pushText, pushThink, pushHitl, isClosed }) => {
        const emitThink = (payload: RagThinkPayload) => {
          void isClosed().then((closed) => {
            if (!closed) {
              void pushThink(payload);
            }
          });
        };
        const answerEmitters: AnswerStreamEmitters = {
          onToken: (token: string) => {
            void isClosed().then((closed) => {
              if (!closed) {
                void pushText(token);
              }
            });
          },
          onHitl: (payload: HitlQuestionnaire) => {
            void isClosed().then((closed) => {
              if (!closed) {
                void pushHitl(payload);
              }
            });
          },
        };

        emitThink({
          phase: '질문 분석',
          content: '질문을 확인하고 처리 경로를 정하는 중입니다.',
          node: 'route',
          status: 'active',
        });
        emitThink({
          phase: '라우트 결정',
          content: routeDecision.detail,
          node: routeDecision.routeType.toLowerCase(),
          status: 'done',
        });

        this.thinkingStream.register(traceId, emitThink);
        this.answerStream.register(traceId, answerEmitters);

        const graphConfig = (threadId: string) => ({
          runName: 'welfare-rag-pipeline',
          tags: ['welfare-ai', 'rag', 'langgraph'],
          metadata: { userId, sessionId, traceId, routeType: routeDecision.routeType },
          configurable: { thread_id: threadId },
        });

        try {
          let result: { answer?: unknown } | null = null;

          // 네이티브 재개: 클래리피케이션에서 interrupt()로 멈춘 체크포인트 스레드를
          // Command({resume})로 이어서 실행한다. await_hitl 노드가 보충 정보를 병합하고
          // traceId를 이번 턴 것으로 교체한 뒤 검색부터 재개한다.
          // 체크포인트 유실 등으로 실패하면 아래 전체 재실행 폴백을 탄다.
          if (resume && pendingHitl?.threadId) {
            const resumeValue: HitlResumeValue = {
              supplement: resume.skipped ? '' : resume.supplement,
              skipped: resume.skipped,
              traceId,
            };
            try {
              result = await graph.invoke(
                new Command({ resume: resumeValue }),
                graphConfig(pendingHitl.threadId),
              );
            } catch (error) {
              this.logger.warn(
                `HITL 네이티브 재개 실패(thread=${pendingHitl.threadId}), 전체 재실행으로 폴백: ${(error as Error).message}`,
              );
              result = null;
            }
          }

          // 새 질문 턴, 구버전 pending 메타(threadId 없음), 또는 재개 실패 폴백.
          if (!result) {
            result = await graph.invoke(
              {
                question: effectiveQuestion,
                userId,
                sessionId,
                traceId,
                messages: [],
                profile: null,
                answer: '',
                hitlResumed: Boolean(resume),
              },
              graphConfig(traceId),
            );
          }

          emitThink({
            phase: '답변 정리',
            content: '찾은 근거를 바탕으로 답변을 정리하고 있습니다.',
            node: 'answer',
            status: 'done',
          });

          return {
            answer: typeof result?.answer === 'string' ? result.answer : '',
          };
        } finally {
          this.thinkingStream.unregister(traceId, emitThink);
          this.answerStream.unregister(traceId, answerEmitters);
        }
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

  private getGraphForRoute(routeType: RagRouteType): InvokableRagGraph {
    return this.graphs.get(routeType) ?? this.graphs.get(DEFAULT_ROUTE)!;
  }

  // 직전 assistant 메시지가 HITL 클래리피케이션이면 그 pending 컨텍스트를 돌려준다.
  // 다른 메시지가 끼면(사용자가 새 질문을 한 뒤) 자연히 재개 대상에서 벗어난다.
  private async loadPendingHitl(sessionId: string) {
    const last = await this.messageRepo.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    if (!last || last.role !== 'assistant') return null;
    return extractPendingHitl(last.ragContext);
  }

  private async loadChatHistory(sessionId: string) {
    const recent = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return recent
      .reverse()
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  private async saveAssistantMessage(
    sessionId: string,
    role: string,
    content: string,
    meta?: Record<string, unknown>,
  ) {
    if (role === 'assistant' && !(await this.chatRuntime.isSessionOpen(sessionId))) {
      return;
    }

    await this.persistMessage(sessionId, role, content, undefined, meta);
  }

  private async saveUserMessage(sessionId: string, content: string) {
    await this.persistMessage(sessionId, 'user', content, content.slice(0, 60).trim());
  }

  private async persistMessage(
    sessionId: string,
    role: 'user' | 'assistant' | string,
    content: string,
    nextTitle?: string,
    ragContext?: Record<string, unknown>,
  ) {
    await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        session: { id: sessionId } as ChatSession,
        role,
        content,
        ...(ragContext ? { ragContext } : {}),
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
