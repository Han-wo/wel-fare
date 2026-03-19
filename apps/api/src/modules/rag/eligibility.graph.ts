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
import { retrievalResultToPromptBlock } from './retrieval.types';
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
  eligibilityContext: Annotation<string>(),
});

type EligibilityGraphState = typeof GraphState.State;

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
    `- 특이조건: ${[profile.isDisabled ? '장애인' : '', profile.isVeteran ? '국가유공자' : '']
      .filter(Boolean)
      .join(', ') || '없음'}`,
  ].join('\n');
}

async function streamAnswer(
  llm: ChatOpenAI,
  state: EligibilityGraphState,
  config?: RunnableConfig,
): Promise<Partial<EligibilityGraphState>> {
  const stream = await llm.stream(state.messages, {
    ...config,
    runName: 'welfare-eligibility-workflow',
    tags: ['welfare-ai', 'eligibility', 'langgraph'],
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
    const fallback = '적격 여부를 판단하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return { messages: [new AIMessage(fallback)], answer: fallback };
  }

  return {
    messages: [new AIMessage(answer)],
    answer,
  };
}

export function createEligibilityGraph(services: RagGraphServices) {
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  async function loadContext(state: EligibilityGraphState): Promise<Partial<EligibilityGraphState>> {
    const [profile, rawHistory] = await Promise.all([
      services.getProfile(state.userId),
      services.loadHistory(state.sessionId),
    ]);

    const systemPrompt = `당신은 대한민국 복지 정책 적격성 판정 도우미입니다.

반드시 아래 원칙을 지킵니다.
1. 제공된 사용자 프로필과 검색된 정책 문서만 근거로 판단합니다.
2. 정보가 부족하면 추측하지 말고 "불확실"로 두고 추가 확인 항목을 적습니다.
3. 답변 첫 줄에 반드시 다음 셋 중 하나를 씁니다: [가능], [불확실], [어려움]
4. 신청 가능성 판단 뒤에는 근거, 확인 필요 정보, 다음 단계 순서로 답합니다.
5. 링크나 조건은 검색 결과에 있는 내용만 씁니다.`;

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
    state: EligibilityGraphState,
  ): Promise<Partial<EligibilityGraphState>> {
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'ELIGIBILITY',
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
        routeType: 'ELIGIBILITY',
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

  async function collectEligibilityContext(
    state: EligibilityGraphState,
  ): Promise<Partial<EligibilityGraphState>> {
    const result = await services.searchPolicyEligibility(
      state.question,
      state.userId,
      state.traceId,
    );
    const profileSummary = result.profileSummary ?? formatProfile(state.profile);
    const docsText = retrievalResultToPromptBlock(result, {
      heading: '정책 후보 문서',
      emptyLabel: '관련 정책을 찾지 못했습니다.',
    });

    const contextText = [
      '## 사용자 프로필',
      profileSummary,
      '',
      docsText,
      '',
      '위 자료만 근거로 사용자의 적격 가능성을 판단하세요.',
    ].join('\n');

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '자격확인 workflow 실행',
      detail: `${result.summary} 이를 바탕으로 적격 가능성을 판단합니다.`,
      payload: { candidateCount: result.items.length, source: result.source },
    });

    return {
      eligibilityContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  async function generateAnswer(
    state: EligibilityGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<EligibilityGraphState>> {
    return streamAnswer(llm, state, config);
  }

  async function saveMessage(state: EligibilityGraphState): Promise<Partial<EligibilityGraphState>> {
    if (state.sessionId && state.answer) {
      await services.saveMessage(state.sessionId, 'assistant', state.answer);
    }
    return {};
  }

  function routeAfterMissingInfo(
    state: EligibilityGraphState,
  ): 'collect_eligibility_context' | 'save_message' {
    return state.answer ? 'save_message' : 'collect_eligibility_context';
  }

  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('collect_eligibility_context', collectEligibilityContext)
    .addNode('generate_answer', generateAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_eligibility_context: 'collect_eligibility_context',
      save_message: 'save_message',
    })
    .addEdge('collect_eligibility_context', 'generate_answer')
    .addEdge('generate_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
