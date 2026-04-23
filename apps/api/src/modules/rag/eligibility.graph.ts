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
import type { EligibilityRetrievalResult, RetrievalResult } from './retrieval.types';
import { type RagGraphServices } from './rag.graph';
import type { RagThinkPayload } from './thinking.types';
import { detectAnswerNeedsHitl } from './hitl-detection';

const RETRIEVAL_MIN_AVG_SCORE = 0.35;

function isRetrievalInsufficient(
  result: RetrievalResult | EligibilityRetrievalResult,
): boolean {
  if (result.items.length === 0) return true;
  const scores = result.items
    .map((item) => item.score ?? null)
    .filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return false;
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return avg < RETRIEVAL_MIN_AVG_SCORE;
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
  streamCallback: Annotation<((token: string) => void) | null>(),
  hitlCallback: Annotation<((payload: import('./hitl.types').HitlQuestionnaire) => void) | null>(),
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
  const emitThink = (traceId: string | null | undefined, input: RagThinkPayload) => {
    if (!traceId) return;
    services.emitThink(traceId, input);
  };

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  async function loadContext(state: EligibilityGraphState): Promise<Partial<EligibilityGraphState>> {
    emitThink(state.traceId, {
      phase: '컨텍스트 로드',
      content: '프로필과 이전 대화를 불러오는 중입니다.',
      node: 'load_context',
      status: 'active',
    });
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
    emitThink(state.traceId, {
      phase: '질문 점검',
      content: '자격 판단에 필요한 정보가 충분한지 확인하는 중입니다.',
      node: 'request_missing_info',
      status: 'active',
    });
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'ELIGIBILITY',
      question: state.question,
      profile: state.profile,
    });

    if (!clarification) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '추가 정보 없이 자격 가능성 판단을 진행할 수 있습니다.',
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
        routeType: 'ELIGIBILITY',
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
    };
  }

  async function collectEligibilityContext(
    state: EligibilityGraphState,
  ): Promise<Partial<EligibilityGraphState>> {
    emitThink(state.traceId, {
      phase: '자격 근거 수집',
      content: '정책 후보와 사용자 조건을 비교할 근거를 모으는 중입니다.',
      node: 'collect_eligibility_context',
      status: 'active',
    });
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

    emitThink(state.traceId, {
      phase: '자격 근거 수집',
      content: `${result.summary} 자격 판단 근거를 정리했습니다.`,
      node: 'collect_eligibility_context',
      status: 'done',
    });

    if (isRetrievalInsufficient(result)) {
      const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
        question: state.question,
        profile: state.profile,
        retrieval: result,
      });
      state.hitlCallback?.(questionnaire);
      const message = '관련 근거가 부족해 먼저 질문 범위를 확인하고 싶어요.';
      state.streamCallback?.(message);

      services.recordEvent(state.traceId, {
        type: 'decision',
        title: '근거 부족 — HITL 추천 요청',
        detail: message,
        payload: { candidateCount: result.items.length, reason: questionnaire.reason },
      });

      return {
        eligibilityContext: contextText,
        messages: [new AIMessage(message)],
        answer: message,
      };
    }

    return {
      eligibilityContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  function routeAfterContext(
    state: EligibilityGraphState,
  ): 'generate_answer' | 'save_message' {
    return state.answer ? 'save_message' : 'generate_answer';
  }

  async function generateAnswer(
    state: EligibilityGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<EligibilityGraphState>> {
    emitThink(state.traceId, {
      phase: '답변 작성',
      content: '가능 여부와 확인 포인트를 정리하는 중입니다.',
      node: 'generate_answer',
      status: 'active',
    });
    return streamAnswer(llm, state, config);
  }

  async function verifyAnswer(
    state: EligibilityGraphState,
  ): Promise<Partial<EligibilityGraphState>> {
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

    return {};
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
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_eligibility_context: 'collect_eligibility_context',
      save_message: 'save_message',
    })
    .addConditionalEdges('collect_eligibility_context', routeAfterContext, {
      generate_answer: 'generate_answer',
      save_message: 'save_message',
    })
    .addEdge('generate_answer', 'verify_answer')
    .addEdge('verify_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
