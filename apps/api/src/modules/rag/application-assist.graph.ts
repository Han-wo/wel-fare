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
  streamCallback: Annotation<((token: string) => void) | null>(),
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
    return { messages: [new AIMessage(fallback)], answer: fallback };
  }

  return {
    messages: [new AIMessage(answer)],
    answer,
  };
}

export function createApplicationAssistGraph(services: RagGraphServices) {
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  async function loadContext(state: ApplicationGraphState): Promise<Partial<ApplicationGraphState>> {
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
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'APPLICATION_ASSIST',
      question: state.question,
      profile: state.profile,
    });

    if (!clarification) {
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

    state.streamCallback?.(clarification.prompt);

    return {
      messages: [new AIMessage(clarification.prompt)],
      answer: clarification.prompt,
    };
  }

  async function collectApplicationContext(
    state: ApplicationGraphState,
  ): Promise<Partial<ApplicationGraphState>> {
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

    return {
      applicationContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  async function generateAnswer(
    state: ApplicationGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<ApplicationGraphState>> {
    return streamAnswer(llm, state, config);
  }

  async function saveMessage(state: ApplicationGraphState): Promise<Partial<ApplicationGraphState>> {
    if (state.sessionId && state.answer) {
      await services.saveMessage(state.sessionId, 'assistant', state.answer);
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
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_application_context: 'collect_application_context',
      save_message: 'save_message',
    })
    .addEdge('collect_application_context', 'generate_answer')
    .addEdge('generate_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
