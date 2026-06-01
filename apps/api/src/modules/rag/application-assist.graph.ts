import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
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
  streamCallback: Annotation<((token: string) => void) | null>(),
  hitlCallback: Annotation<((payload: import('./hitl.types').HitlQuestionnaire) => void) | null>(),
  hitlMeta: Annotation<Record<string, unknown> | null>({
    reducer: (_current, next) => next,
    default: () => null,
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

  return [
    `- 나이: ${age}`,
    `- 거주지: ${region}`,
    `- 가구형태: ${profile.householdType ?? '미입력'}`,
    `- 직업: ${profile.occupationType ?? '미입력'}`,
    `- 소득: 중위소득 ${profile.incomeBracket ?? '미입력'}% 이하`,
    `- 주거상태: ${profile.isHomeowner ? '자가' : '무주택/임차'}`,
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
      state.streamCallback?.(aiChunk.content);
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

export function createApplicationAssistGraph(services: RagGraphServices) {
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

    const systemPrompt = `당신은 대한민국 복지 신청 도우미입니다.

반드시 아래 원칙을 지킵니다.
1. 검색 결과에 있는 내용만 사용합니다. 없는 서류나 절차를 만들지 않습니다.
2. 답변은 실행 중심으로 씁니다.
3. 다음 순서로 정리합니다: 신청 대상, 신청 순서, 준비 서류, 확인할 마감/주의사항, 링크/문의처.
4. 정보가 부족하면 "공고문 확인 필요"를 분명하게 적습니다.
5. 마지막에 "바로 할 일" 2~3개를 짧게 정리합니다.`;

    const historyMessages: BaseMessage[] = rawHistory.map((message) =>
      message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
    );

    return {
      profile,
      messages: [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        new HumanMessage(state.question),
      ],
    };
  }

  async function requestMissingInfo(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
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

    state.hitlCallback?.(questionnaire);
    state.streamCallback?.(clarification.prompt);

    emitThink(state.traceId, {
      phase: '추가 정보 요청',
      content: clarification.detail,
      node: 'request_missing_info',
      status: 'done',
    });

    return {
      messages: [new AIMessage(clarification.prompt)],
      answer: clarification.prompt,
      skipSave: false,
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
    if (isResultsInsufficient(combined)) {
      const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
        question: state.question,
        profile: state.profile,
        retrieval: combined,
      });
      state.hitlCallback?.(questionnaire);
      const message = '신청 방법을 정리할 근거가 부족해, 어떤 분야를 알아보시는지 먼저 확인하고 싶어요.';
      state.streamCallback?.(message);

      return {
        applicationContext: contextText,
        messages: [new AIMessage(message)],
        answer: message,
        skipSave: false,
      };
    }

    return {
      applicationContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  function routeAfterContext(
    state: ApplicationGraphState,
  ): 'generate_answer' | 'save_message' {
    return state.answer ? 'save_message' : 'generate_answer';
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
    return streamAnswer(llm, state, config);
  }

  async function verifyAnswer(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
    const detection = detectAnswerNeedsHitl(state.answer);
    if (!detection.needsHitl) return {};

    const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
      question: state.question,
      profile: state.profile,
      retrieval: null,
    });
    state.hitlCallback?.(questionnaire);

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '답변 후 HITL 전환',
      detail: questionnaire.detail,
      payload: { detectionReason: detection.reason, questionnaireId: questionnaire.id },
    });

    return {
      hitlMeta: {
        hitl: {
          reason: detection.reason,
          questionnaireId: questionnaire.id,
          source: 'verify_answer',
        },
      },
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
  ): 'collect_application_context' | 'save_message' {
    return state.answer ? 'save_message' : 'collect_application_context';
  }

  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('collect_application_context', collectApplicationContext)
    .addNode('generate_answer', generateAnswer)
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_application_context: 'collect_application_context',
      save_message: 'save_message',
    })
    .addConditionalEdges('collect_application_context', routeAfterContext, {
      generate_answer: 'generate_answer',
      save_message: 'save_message',
    })
    .addEdge('generate_answer', 'verify_answer')
    .addEdge('verify_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
