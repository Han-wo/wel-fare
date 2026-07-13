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
import { POST_APPLICATION_SYSTEM_PROMPT } from './prompts';

/**
 * 사후관리(POST_APPLICATION) 그래프.
 *
 * 신청·접수 이후의 질문 전용 workflow: 심사 기간·결과 확인, 반려·탈락 대응,
 * 이의신청, 재신청. 다른 세 그래프가 전부 "신청 전" 단계를 커버하는 것과
 * 대비되는 네 번째 라우트다.
 *
 * retrieval은 (1) 해당 정책의 자격·조건 구조 조회(반려 사유 추정과 재신청
 * 요건 확인에 필요)와 (2) 일반 복지 검색(절차·문의처 문서)을 병렬로 합친다.
 */
const POST_RETRIEVAL_MIN_AVG_SCORE = 0.35;

function isResultsInsufficient(results: RetrievalResult[]): boolean {
  const items = results.flatMap((result) => result.items);
  if (items.length === 0) return true;
  const scores = items
    .map((item) => item.score ?? null)
    .filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return false;
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return avg < POST_RETRIEVAL_MIN_AVG_SCORE;
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
  postApplicationContext: Annotation<string>(),
});

type PostApplicationGraphState = typeof GraphState.State;

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
    `- 소득: 중위소득 ${profile.incomeBracket ?? '미입력'}% 이하`,
    `- 주거상태: ${profile.isHomeowner ? '자가' : '무주택/임차'}`,
    ...(factsLine ? [factsLine] : []),
  ].join('\n');
}

async function streamAnswer(
  llm: ChatOpenAI,
  state: PostApplicationGraphState,
  emitToken: (token: string) => void,
  config?: RunnableConfig,
): Promise<Partial<PostApplicationGraphState>> {
  const stream = await llm.stream(state.messages, {
    ...config,
    runName: 'welfare-post-application-workflow',
    tags: ['welfare-ai', 'post-application', 'langgraph'],
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
    const fallback = '사후관리 안내를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return { messages: [new AIMessage(fallback)], answer: fallback, skipSave: false };
  }

  return {
    messages: [new AIMessage(answer)],
    answer,
    skipSave: false,
  };
}

export function createPostApplicationGraph(
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

  async function loadContext(
    state: PostApplicationGraphState,
  ): Promise<Partial<PostApplicationGraphState>> {
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

    services.recordContext(state.traceId, {
      historyCount: rawHistory.length,
      profileSummary: profile
        ? {
            householdType: profile.householdType ?? null,
            incomeBracket: profile.incomeBracket ?? null,
            isHomeowner: profile.isHomeowner ?? null,
          }
        : null,
    });

    emitThink(state.traceId, {
      phase: '컨텍스트 로드',
      content: `이전 대화 ${rawHistory.length}개와 프로필 정보를 반영했습니다.`,
      node: 'load_context',
      status: 'done',
    });

    return {
      profile,
      messages: [
        new SystemMessage(POST_APPLICATION_SYSTEM_PROMPT),
        ...historyMessages,
        new HumanMessage(state.question),
      ],
    };
  }

  async function requestMissingInfo(
    state: PostApplicationGraphState,
  ): Promise<Partial<PostApplicationGraphState>> {
    if (state.hitlResumed) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '보충 답변을 반영해 재질문 없이 사후관리 안내를 진행합니다.',
        node: 'request_missing_info',
        status: 'done',
      });
      return {};
    }

    emitThink(state.traceId, {
      phase: '질문 점검',
      content: '어떤 신청 건인지 확인에 필요한 정보가 충분한지 점검하는 중입니다.',
      node: 'request_missing_info',
      status: 'active',
    });
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'POST_APPLICATION',
      question: state.question,
      profile: state.profile,
    });

    if (!clarification) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '바로 사후관리 안내를 진행할 수 있습니다.',
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
        routeType: 'POST_APPLICATION',
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
      routeType: 'POST_APPLICATION',
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

  async function collectPostApplicationContext(
    state: PostApplicationGraphState,
  ): Promise<Partial<PostApplicationGraphState>> {
    emitThink(state.traceId, {
      phase: '사후관리 자료 수집',
      content: '해당 정책의 조건과 절차 문서를 수집하는 중입니다.',
      node: 'collect_post_application_context',
      status: 'active',
    });

    // 정책 조건 구조(반려 사유 추정·재신청 요건)와 일반 절차 문서를 병렬 수집.
    const [eligibility, welfare] = await Promise.all([
      services.searchPolicyEligibility(state.question, state.userId, state.traceId),
      services.searchWelfare(state.question, state.userId, state.traceId),
    ]);
    const results: RetrievalResult[] = [eligibility, welfare];
    const documentCount = results.reduce((count, result) => count + result.items.length, 0);

    const contextText = [
      '## 사용자 프로필',
      formatProfile(state.profile),
      '',
      '## 사후관리 참고 자료',
      documentCount > 0
        ? combineRetrievalPromptBlocks([
            { title: '정책 조건·자격 문서', result: eligibility },
            { title: '절차·안내 문서', result: welfare },
          ])
        : '관련 문서를 찾지 못했습니다.',
      '',
      '위 자료만 사용해서 신청 이후 단계(확인·대응·이의신청·재신청)를 안내하세요.',
    ].join('\n');

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '사후관리 workflow 실행',
      detail: `정책 조건·절차 문서 ${documentCount}건을 수집했습니다.`,
      payload: { documentCount },
    });

    emitThink(state.traceId, {
      phase: '사후관리 자료 수집',
      content: `참고 문서 ${documentCount}건을 정리했습니다.`,
      node: 'collect_post_application_context',
      status: 'done',
    });

    // 재개된 턴은 근거가 약해도 재질문 대신 안내까지 진행한다. 시스템 프롬프트가
    // 부족한 부분을 "공고문·담당기관 확인 필요"로 명시하도록 이미 강제한다.
    if (isResultsInsufficient(results) && !state.hitlResumed) {
      const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
        question: state.question,
        profile: state.profile,
        retrieval: welfare,
      });
      services.emitHitl(state.traceId, questionnaire);
      const message =
        '어떤 정책 신청 건인지 근거를 정확히 찾지 못했어요. 아래에서 선택해주시면 그 기준으로 안내할게요.';
      services.emitToken(state.traceId, message);

      services.recordEvent(state.traceId, {
        type: 'decision',
        title: '근거 부족 — HITL 추천 요청',
        detail: message,
        payload: { documentCount, reason: questionnaire.reason },
      });

      const pending: PendingHitl = {
        originalQuestion: state.question,
        routeType: 'POST_APPLICATION',
        reason: questionnaire.reason,
        source: 'collect_post_application_context',
        questionnaireId: questionnaire.id,
        threadId: state.traceId,
      };
      return {
        postApplicationContext: contextText,
        messages: [new AIMessage(message)],
        answer: message,
        skipSave: false,
        hitlMeta: buildPendingHitlMeta(pending),
        pendingHitl: { questionnaire, pending },
      };
    }

    return {
      postApplicationContext: contextText,
      messages: [new HumanMessage(contextText)],
    };
  }

  function routeAfterContext(
    state: PostApplicationGraphState,
  ): 'generate_answer' | 'save_hitl_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'generate_answer';
  }

  async function generateAnswer(
    state: PostApplicationGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<PostApplicationGraphState>> {
    emitThink(state.traceId, {
      phase: '답변 작성',
      content: '확인 방법과 대응 단계를 정리하는 중입니다.',
      node: 'generate_answer',
      status: 'active',
    });
    return streamAnswer(llm, state, (token) => services.emitToken(state.traceId, token), config);
  }

  async function verifyAnswer(
    state: PostApplicationGraphState,
  ): Promise<Partial<PostApplicationGraphState>> {
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
      routeType: 'POST_APPLICATION',
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

  async function saveMessage(
    state: PostApplicationGraphState,
  ): Promise<Partial<PostApplicationGraphState>> {
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
    state: PostApplicationGraphState,
  ): 'collect_post_application_context' | 'save_hitl_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'collect_post_application_context';
  }

  function routeAfterVerify(
    state: PostApplicationGraphState,
  ): 'save_hitl_message' | 'save_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'save_message';
  }

  // save_hitl_message는 save_message와 같은 저장 로직이지만, 저장 후 END가 아니라
  // await_hitl로 이어져 interrupt()로 그래프를 멈춘다. 보충 답변이 오면
  // Command({resume})가 await_hitl부터 재개해 collect로 되돌아간다.
  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('collect_post_application_context', collectPostApplicationContext)
    .addNode('generate_answer', generateAnswer)
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addNode('save_hitl_message', saveMessage)
    .addNode('await_hitl', createAwaitHitlNode<PostApplicationGraphState>(services))
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      collect_post_application_context: 'collect_post_application_context',
      save_hitl_message: 'save_hitl_message',
    })
    .addConditionalEdges('collect_post_application_context', routeAfterContext, {
      generate_answer: 'generate_answer',
      save_hitl_message: 'save_hitl_message',
    })
    .addEdge('generate_answer', 'verify_answer')
    .addConditionalEdges('verify_answer', routeAfterVerify, {
      save_hitl_message: 'save_hitl_message',
      save_message: 'save_message',
    })
    .addEdge('save_hitl_message', 'await_hitl')
    .addEdge('await_hitl', 'collect_post_application_context')
    .addEdge('save_message', END)
    .compile({ checkpointer });
}
