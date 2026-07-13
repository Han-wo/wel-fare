import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type AIMessageChunk,
  type BaseMessage,
} from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { UserProfile } from '@welfare-ai/shared-types';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import { combineRetrievalPromptBlocks, type RetrievalResult } from './retrieval.types';
import { type RagGraphServices } from './rag.graph';
import type { RagThinkPayload } from './thinking.types';
import { detectAnswerNeedsHitl } from './hitl-detection';
import { buildPendingHitlMeta, type PendingHitl } from './hitl-resume';
import { createAwaitHitlNode, type HitlInterruptPayload } from './hitl-interrupt';
import { formatHitlFactsLine } from './profile-facts';
import { APPLICATION_ASSIST_SYSTEM_PROMPT } from './prompts';
import { checkApplicationAnswerFormat } from './answer-format';

const APPLICATION_RETRIEVAL_MIN_AVG_SCORE = 0.35;

function combineRetrievalSummary(results: RetrievalResult[]): RetrievalResult | null {
  if (results.length === 0) return null;
  const items = results.flatMap((result) => result.items);
  return {
    source: results[0]?.source ?? 'combined',
    query: results[0]?.query ?? '',
    summary: `결합 후보 ${items.length}건`,
    items,
  } as RetrievalResult;
}

function isResultsInsufficient(result: RetrievalResult | null): boolean {
  if (!result || result.items.length === 0) return true;
  const scores = result.items
    .map((item) => item.score ?? null)
    .filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return false;
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return avg < APPLICATION_RETRIEVAL_MIN_AVG_SCORE;
}

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  traceId: Annotation<string>(),
  profile: Annotation<UserProfile | null>(),
  answer: Annotation<string>(),
  skipSave: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  hitlMeta: Annotation<Record<string, unknown> | null>({
    reducer: (_current, next) => next,
    default: () => null,
  }),
  // interrupt() 대기 중인 HITL 설문. 콜백 함수는 state에 싣지 않는다(체크포인트 직렬화).
  pendingHitl: Annotation<HitlInterruptPayload | null>({
    reducer: (_current, next) => next,
    default: () => null,
  }),
  // HITL 보충 답변으로 재개된 턴 — 재질문 없이 끝까지 진행 (ask-at-most-once).
  hitlResumed: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  applicationContext: Annotation<string>(),
});

type ApplicationGraphState = typeof GraphState.State;

function formatProfile(profile: UserProfile | null): string {
  if (!profile) {
    return '- 프로필 미설정';
  }

  const age = profile.birthDate ? `${calcAge(profile.birthDate)}세` : '미입력';
  const region = profile.sidoCode ? getSidoName(profile.sidoCode) : '미입력';
  const factsLine = formatHitlFactsLine(profile);

  return [
    `- 나이: ${age}`,
    `- 거주지: ${region}`,
    `- 가구형태: ${profile.householdType ?? '미입력'}`,
    `- 직업: ${profile.occupationType ?? '미입력'}`,
    `- 소득: 중위소득 ${profile.incomeBracket ?? '미입력'}% 이하`,
    `- 주거상태: ${profile.isHomeowner ? '자가' : '무주택/임차'}`,
    ...(factsLine ? [factsLine] : []),
  ].join('\n');
}

function dedupeResults(results: RetrievalResult[]) {
  const seen = new Set<string>();
  const deduped: RetrievalResult[] = [];

  for (const result of results) {
    const items = result.items.filter((item) => {
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (items.length === 0) continue;
    deduped.push({ ...result, items });
  }

  return deduped;
}

async function streamAnswer(
  llm: ChatOpenAI,
  state: ApplicationGraphState,
  emitToken: (token: string) => void,
  config?: RunnableConfig,
): Promise<Partial<ApplicationGraphState>> {
  const stream = await llm.stream(state.messages, {
    ...config,
    runName: 'welfare-application-assist-workflow',
    tags: ['welfare-ai', 'application-assist', 'langgraph'],
  });

  let answer = '';
  const chunks: AIMessageChunk[] = [];

  for await (const chunk of stream) {
    const aiChunk = chunk as AIMessageChunk;
    chunks.push(aiChunk);

    if (typeof aiChunk.content === 'string' && aiChunk.content) {
      answer += aiChunk.content;
      emitToken(aiChunk.content);
    }
  }

  if (chunks.length === 0) {
    const fallback = '신청 절차를 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return { messages: [new AIMessage(fallback)], answer: fallback, skipSave: false };
  }

  return {
    messages: [new AIMessage(answer)],
    answer,
    skipSave: false,
  };
}

export function createApplicationAssistGraph(
  services: RagGraphServices,
  checkpointer?: BaseCheckpointSaver,
) {
  const emitThink = (traceId: string | null | undefined, input: RagThinkPayload) => {
    if (!traceId) return;
    services.emitThink(traceId, input);
  };

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  async function loadContext(state: ApplicationGraphState): Promise<Partial<ApplicationGraphState>> {
    emitThink(state.traceId, {
      phase: '컨텍스트 로드',
      content: '이전 대화와 프로필을 불러오는 중입니다.',
      node: 'load_context',
      status: 'active',
    });
    const [profile, rawHistory] = await Promise.all([
      services.getProfile(state.userId),
      services.loadHistory(state.sessionId),
    ]);

    const historyMessages: BaseMessage[] = rawHistory.map((message) =>
      message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
    );

    return {
      profile,
      messages: [
        new SystemMessage(APPLICATION_ASSIST_SYSTEM_PROMPT),
        ...historyMessages,
        new HumanMessage(state.question),
      ],
    };
  }

  async function requestMissingInfo(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
    if (state.hitlResumed) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '보충 답변을 반영해 재질문 없이 신청 도움을 진행합니다.',
        node: 'request_missing_info',
        status: 'done',
      });
      return {};
    }

    emitThink(state.traceId, {
      phase: '질문 점검',
      content: '신청 도움에 필요한 정보가 충분한지 확인하는 중입니다.',
      node: 'request_missing_info',
      status: 'active',
    });
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'APPLICATION_ASSIST',
      question: state.question,
      profile: state.profile,
    });

    if (!clarification) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '바로 신청 도움 절차를 정리할 수 있습니다.',
        node: 'request_missing_info',
        status: 'done',
      });
      return {};
    }

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '추가 정보 요청',
      detail: clarification.detail,
      payload: {
        routeType: 'APPLICATION_ASSIST',
        missingFields: clarification.missingFields,
        reason: clarification.reason,
      },
    });

    const questionnaire = await services.hitlSuggestion.buildMissingFieldQuestionnaire({
      missingFields: clarification.missingFields,
      question: state.question,
      profile: state.profile,
    });

    services.emitHitl(state.traceId, questionnaire);
    services.emitToken(state.traceId, clarification.prompt);

    emitThink(state.traceId, {
      phase: '추가 정보 요청',
      content: clarification.detail,
      node: 'request_missing_info',
      status: 'done',
    });

    const pending: PendingHitl = {
      originalQuestion: state.question,
      routeType: 'APPLICATION_ASSIST',
      reason: 'missing_profile',
      source: 'request_missing_info',
      questionnaireId: questionnaire.id,
      missingFields: clarification.missingFields,
      threadId: state.traceId,
    };
    return {
      messages: [new AIMessage(clarification.prompt)],
      answer: clarification.prompt,
      skipSave: false,
      hitlMeta: buildPendingHitlMeta(pending),
      pendingHitl: { questionnaire, pending },
    };
  }

  async function collectApplicationContext(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
    emitThink(state.traceId, {
      phase: '신청 자료 수집',
      content: '질문 유형에 맞는 정책 자료와 신청 근거를 수집하는 중입니다.',
      node: 'collect_application_context',
      status: 'active',
    });
    const selectedSources = services.queryAnalysis.selectApplicationSources({
      question: state.question,
      hasProfile: Boolean(state.profile),
    });

    const retrievalTasks = selectedSources.map((source) => {
      switch (source) {
        case 'deadline':
          return services.getUpcomingDeadlines(state.userId, 14, state.traceId);
        case 'youth':
          return services.searchYouthPolicies(state.question, state.traceId);
        case 'housing_subscription':
          return services.searchHousingSubscriptions(state.question, state.userId, state.traceId);
        case 'rental_support':
          return services.searchRentalSupport(state.question, state.userId, state.traceId);
        case 'welfare_facility':
          return services.searchWelfareFacilities(state.question, '', state.userId, state.traceId);
        case 'policy_lookup':
          return services.searchPolicyEligibility(state.question, state.userId, state.traceId);
        case 'welfare':
        default:
          return services.searchWelfare(state.question, state.userId, state.traceId);
      }
    });

    const results = dedupeResults(await Promise.all(retrievalTasks));
    const documentCount = results.reduce((count, result) => count + result.items.length, 0);

    const contextText = [
      '## 사용자 프로필',
      formatProfile(state.profile),
      '',
      '## 신청 참고 자료',
      results.length > 0
        ? combineRetrievalPromptBlocks(
            results.map((result) => ({
              title: `${result.source} 결과`,
              result,
            })),
          )
        : '관련 신청 자료를 찾지 못했습니다.',
      '',
      '위 자료만 사용해서 신청 절차와 준비사항을 정리하세요.',
    ].join('\n');

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '신청도움 workflow 실행',
      detail: `${selectedSources.join(', ')} 기준으로 신청 자료 ${documentCount}건을 정리했습니다.`,
      payload: { selectedSources, documentCount },
    });

    emitThink(state.traceId, {
      phase: '신청 자료 수집',
      content: `${selectedSources.join(', ')} 기준으로 신청 자료 ${documentCount}건을 정리했습니다.`,
      node: 'collect_application_context',
      status: 'done',
    });

    const combined = combineRetrievalSummary(results);
    // 재개된 턴은 근거가 약해도 재질문 대신 안내까지 진행한다. 시스템 프롬프트가
    // 부족한 부분을 "공고문 확인 필요"로 명시하도록 이미 강제한다.
    if (isResultsInsufficient(combined) && !state.hitlResumed) {
      const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
        question: state.question,
        profile: state.profile,
        retrieval: combined,
      });
      services.emitHitl(state.traceId, questionnaire);
      const message = '신청 방법을 정리할 근거가 부족해, 어떤 분야를 알아보시는지 먼저 확인하고 싶어요.';
      services.emitToken(state.traceId, message);

      const pending: PendingHitl = {
        originalQuestion: state.question,
        routeType: 'APPLICATION_ASSIST',
        reason: questionnaire.reason,
        source: 'collect_application_context',
        questionnaireId: questionnaire.id,
        threadId: state.traceId,
      };
      return {
        applicationContext: contextText,
        messages: [new AIMessage(message)],
        answer: message,
        skipSave: false,
        hitlMeta: buildPendingHitlMeta(pending),
        pendingHitl: { questionnaire, pending },
      };
    }

    return {
      applicationContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  function routeAfterContext(
    state: ApplicationGraphState,
  ): 'generate_answer' | 'save_hitl_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'generate_answer';
  }

  async function generateAnswer(
    state: ApplicationGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<ApplicationGraphState>> {
    emitThink(state.traceId, {
      phase: '답변 작성',
      content: '신청 순서와 준비사항을 정리하는 중입니다.',
      node: 'generate_answer',
      status: 'active',
    });
    return streamAnswer(llm, state, (token) => services.emitToken(state.traceId, token), config);
  }

  async function verifyAnswer(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
    // 형식 준수 관찰(차단 없음): 실행 가이드 구조 계약을 지켰는지 trace에 남긴다.
    if (state.answer) {
      const format = checkApplicationAnswerFormat(state.answer);
      if (!format.compliant) {
        services.recordEvent(state.traceId, {
          type: 'decision',
          title: '답변 형식 경고',
          detail: format.violations.join(', '),
          payload: { route: 'APPLICATION_ASSIST', violations: format.violations },
        });
      }
    }

    const detection = detectAnswerNeedsHitl(state.answer);
    if (!detection.needsHitl || state.hitlResumed) return {};

    const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
      question: state.question,
      profile: state.profile,
      retrieval: null,
    });
    services.emitHitl(state.traceId, questionnaire);

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '답변 후 HITL 전환',
      detail: questionnaire.detail,
      payload: { detectionReason: detection.reason, questionnaireId: questionnaire.id },
    });

    const pending: PendingHitl = {
      originalQuestion: state.question,
      routeType: 'APPLICATION_ASSIST',
      reason: detection.reason ?? 'unknown',
      source: 'verify_answer',
      questionnaireId: questionnaire.id,
      threadId: state.traceId,
    };
    return {
      hitlMeta: buildPendingHitlMeta(pending),
      pendingHitl: { questionnaire, pending },
    };
  }

  async function saveMessage(state: ApplicationGraphState): Promise<Partial<ApplicationGraphState>> {
    if (state.sessionId && state.answer && !state.skipSave) {
      await services.saveMessage(
        state.sessionId,
        'assistant',
        state.answer,
        state.hitlMeta ?? undefined,
      );
    }
    return {};
  }

  function routeAfterMissingInfo(
    state: ApplicationGraphState,
  ): 'collect_application_context' | 'save_hitl_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'collect_application_context';
  }

  function routeAfterVerify(
    state: ApplicationGraphState,
  ): 'save_hitl_message' | 'save_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'save_message';
  }

  // save_hitl_message는 save_message와 같은 저장 로직이지만, 저장 후 END가 아니라
  // await_hitl로 이어져 interrupt()로 그래프를 멈춘다. 보충 답변이 오면
  // Command({resume})가 await_hitl부터 재개해 collect로 되돌아간다.
  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('collect_application_context', collectApplicationContext)
    .addNode('generate_answer', generateAnswer)
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addNode('save_hitl_message', saveMessage)
    .addNode('await_hitl', createAwaitHitlNode<ApplicationGraphState>(services))
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_application_context: 'collect_application_context',
      save_hitl_message: 'save_hitl_message',
    })
    .addConditionalEdges('collect_application_context', routeAfterContext, {
      generate_answer: 'generate_answer',
      save_hitl_message: 'save_hitl_message',
    })
    .addEdge('generate_answer', 'verify_answer')
    .addConditionalEdges('verify_answer', routeAfterVerify, {
      save_hitl_message: 'save_hitl_message',
      save_message: 'save_message',
    })
    .addEdge('save_hitl_message', 'await_hitl')
    .addEdge('await_hitl', 'collect_application_context')
    .addEdge('save_message', END)
    .compile({ checkpointer });
}
