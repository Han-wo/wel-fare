import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { UserProfile } from '@welfare-ai/shared-types';
import type { QueryAnalysisService } from './query-analysis.service';
import type {
  EligibilityRetrievalResult,
  RetrievalResult,
} from './retrieval.types';
import { toStructuredToolPayload } from './retrieval.types';
import type { RagThinkPayload } from './thinking.types';
import type { HitlQuestionnaire } from './hitl.types';
import type { HitlSuggestionService } from './hitl-suggestion.service';
import { detectAnswerNeedsHitl } from './hitl-detection';

const uid = () => `pre_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 동적 사용자 정보(오늘 날짜/age/region/userId)는 별도 메시지로 분리해 prompt caching 적중률을 높인다.
const SEARCH_SYSTEM_PROMPT = `당신은 대한민국 복지·지원금 정책 전문 AI 컨설턴트입니다. 사용자 맞춤 정책을 찾아 신청까지 도와줍니다.

## 도구 출력 규칙
도구 출력은 JSON 구조입니다.
- summary: 검색 요약
- graphSummary: 그래프 보강 요약
- items[]: 실제 근거 문서
- items[].content: 답변 근거로 직접 인용 가능한 원문

## 도구 사용 규칙
질문이 복합적이면 여러 도구를 동시에 호출하세요.
- 일반 복지·수당·급여·서비스: search_welfare
- 청년 전용: search_youth_policy
- 청약·분양 공고·청약 일정: search_housing_subscription
- 전세·월세 지원·LH임대·주거급여: search_rental_support
- 복지 시설·기관 위치: search_welfare_facility
- 특정 정책 자격 확인: check_policy_eligibility
- 지금 신청 가능한 청약: get_upcoming_deadlines

## 정확도 규칙
1. 검색 결과 JSON에 있는 내용만 답변합니다. 없는 내용은 추측하지 않습니다.
2. 정책명·금액·신청링크는 items[].content와 metadata에 있는 원문만 사용합니다.
3. 검색 결과가 없으면 찾지 못했다고 답하고, 필요한 추가 조건을 안내합니다.
4. 사용자 조건과 맞지 않는 정책은 제외하거나 조건 불일치를 명시합니다.

## 답변 형식
### 📋 [정책명]
- **지원내용**: 구체적인 금액·서비스
- **신청대상**: 조건 요약
- **신청방법**: 온라인/방문/전화 등
- **신청링크**: [바로 신청하기](URL)
- **문의**: 담당기관·전화번호 (있는 경우)

정책 여러 개면 사용자 조건에 가장 부합하는 것부터 안내합니다.
마감일이 있으면 **굵게 강조**하고, 이미 종료된 청약은 "접수 종료"를 명시합니다.
마지막에 반드시 "💡 **핵심 요약**: ..." 한 줄을 추가합니다.`;

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
  hitlCallback: Annotation<((payload: HitlQuestionnaire) => void) | null>(),
  hitlMeta: Annotation<Record<string, unknown> | null>({
    reducer: (_current, next) => next,
    default: () => null,
  }),
});

type GraphStateType = typeof GraphState.State;

export interface RagGraphServices {
  queryAnalysis: Pick<
    QueryAnalysisService,
    'resolveSearchPreRoute' | 'getClarificationRequest' | 'selectApplicationSources'
  >;
  hitlSuggestion: Pick<
    HitlSuggestionService,
    'buildMissingFieldQuestionnaire' | 'buildRecoveryQuestionnaire'
  >;
  getProfile: (userId: string) => Promise<UserProfile | null>;
  searchWelfare: (question: string, userId: string, traceId?: string) => Promise<RetrievalResult>;
  searchYouthPolicies: (question: string, traceId?: string) => Promise<RetrievalResult>;
  searchPolicyEligibility: (
    policyName: string,
    userId: string,
    traceId?: string,
  ) => Promise<EligibilityRetrievalResult>;
  searchHousingSubscriptions: (
    question: string,
    userId: string,
    traceId?: string,
  ) => Promise<RetrievalResult>;
  searchRentalSupport: (
    question: string,
    userId: string,
    traceId?: string,
  ) => Promise<RetrievalResult>;
  searchWelfareFacilities: (
    question: string,
    facilityType: string,
    userId: string,
    traceId?: string,
  ) => Promise<RetrievalResult>;
  getUpcomingDeadlines: (
    userId: string,
    daysAhead: number,
    traceId?: string,
  ) => Promise<RetrievalResult>;
  loadHistory: (sessionId: string) => Promise<Array<{ role: string; content: string }>>;
  saveMessage: (
    sessionId: string,
    role: string,
    content: string,
    meta?: Record<string, unknown>,
  ) => Promise<void>;
  recordContext: (
    traceId: string,
    input: { historyCount: number; profileSummary: Record<string, unknown> | null },
  ) => void;
  recordEvent: (
    traceId: string,
    input: {
      type: 'session' | 'context' | 'decision' | 'vector_search' | 'graph_walk' | 'answer' | 'error';
      title: string;
      detail?: string | null;
      payload?: unknown;
    },
  ) => void;
  recordToolSelection: (
    traceId: string,
    input: {
      source: 'PRE_ROUTE' | 'AGENT';
      toolName: string;
      args: Record<string, unknown>;
      detail: string;
    },
  ) => void;
  emitThink: (traceId: string, input: RagThinkPayload) => void;
  calcAge: (birthDate: string) => number;
  getSidoName: (code: string) => string;
}

function serializeToolPayload(result: RetrievalResult | EligibilityRetrievalResult) {
  // 들여쓰기 없이 직렬화해 LLM 입력 토큰을 ~30% 절감.
  return JSON.stringify(toStructuredToolPayload(result));
}

export function createRagGraph(services: RagGraphServices) {
  const emitThink = (traceId: string | null | undefined, input: RagThinkPayload) => {
    if (!traceId) return;
    services.emitThink(traceId, input);
  };

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });
  // traceId는 LLM에 노출하지 않는다. 도구 호출 시 RunnableConfig.metadata로 전달되며,
  // orchestrator의 graph.invoke()가 이미 metadata.traceId를 채워 모든 노드/도구에 전파한다.
  const extractTraceId = (config?: RunnableConfig): string | null => {
    const value = config?.metadata?.traceId;
    return typeof value === 'string' ? value : null;
  };

  const searchWelfare = tool(
    async (
      { question, userId }: { question: string; userId: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '복지 검색',
        content: '일반 복지 정책과 지원 제도를 검색하는 중입니다.',
        node: 'search_welfare',
        status: 'active',
      });
      const result = await services.searchWelfare(question, userId, traceId ?? undefined);
      emitThink(traceId, {
        phase: '복지 검색',
        content: `${result.summary} 관련 근거를 정리했습니다.`,
        node: 'search_welfare',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'search_welfare',
      description:
        '일반 복지 정책, 수당, 급여, 지원금, 서비스를 검색합니다. 기초생활보장, 의료급여, 장애인 지원, 아동·보육, 교육비 지원, 취업지원, 노인 복지 등에 사용합니다.',
      schema: z.object({
        question: z.string(),
        userId: z.string(),
      }),
    },
  );

  const searchYouthPolicy = tool(
    async (
      { question }: { question: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '청년정책 검색',
        content: '청년 전용 정책과 지원 제도를 찾는 중입니다.',
        node: 'search_youth_policy',
        status: 'active',
      });
      const result = await services.searchYouthPolicies(question, traceId ?? undefined);
      emitThink(traceId, {
        phase: '청년정책 검색',
        content: `${result.summary} 청년정책 후보를 정리했습니다.`,
        node: 'search_youth_policy',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'search_youth_policy',
      description:
        '청년(만 19~34세) 전용 정책을 검색합니다. 청년수당, 청년월세, 청년도약계좌, 청년 취업·창업 지원 등을 찾을 때 사용합니다.',
      schema: z.object({
        question: z.string(),
      }),
    },
  );

  const searchHousingSubscription = tool(
    async (
      { question, userId }: { question: string; userId: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '청약 공고 검색',
        content: '청약홈과 공공주택 공고에서 관련 일정을 찾는 중입니다.',
        node: 'search_housing_subscription',
        status: 'active',
      });
      const result = await services.searchHousingSubscriptions(question, userId, traceId ?? undefined);
      emitThink(traceId, {
        phase: '청약 공고 검색',
        content: `${result.summary} 청약 공고 근거를 정리했습니다.`,
        node: 'search_housing_subscription',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'search_housing_subscription',
      description:
        '공공주택 청약·분양 공고를 검색합니다. 행복주택, 국민임대, 공공분양, 신혼희망타운, LH 청약홈 공고 등 청약 질문에 사용합니다.',
      schema: z.object({
        question: z.string(),
        userId: z.string(),
      }),
    },
  );

  const searchRentalSupport = tool(
    async (
      { question, userId }: { question: string; userId: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '주거 지원 검색',
        content: '임대주택과 전월세 지원 제도를 찾는 중입니다.',
        node: 'search_rental_support',
        status: 'active',
      });
      const result = await services.searchRentalSupport(question, userId, traceId ?? undefined);
      emitThink(traceId, {
        phase: '주거 지원 검색',
        content: `${result.summary} 주거 지원 후보를 정리했습니다.`,
        node: 'search_rental_support',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'search_rental_support',
      description:
        '전세·월세 지원금과 공공임대주택 정보를 검색합니다. 주거급여, 전세자금대출, LH 공공임대단지, 매입임대, 전세임대 등에 사용합니다.',
      schema: z.object({
        question: z.string(),
        userId: z.string(),
      }),
    },
  );

  const searchWelfareFacility = tool(
    async (
      {
        question,
        facility_type,
        userId,
      }: { question: string; facility_type: string; userId: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '복지시설 검색',
        content: '가까운 시설과 관련 복지기관을 찾는 중입니다.',
        node: 'search_welfare_facility',
        status: 'active',
      });
      const result = await services.searchWelfareFacilities(
        question,
        facility_type,
        userId,
        traceId ?? undefined,
      );
      emitThink(traceId, {
        phase: '복지시설 검색',
        content: `${result.summary} 시설 후보를 정리했습니다.`,
        node: 'search_welfare_facility',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'search_welfare_facility',
      description:
        '복지 시설(기관)을 검색합니다. 장애인 활동지원 기관, 노인 주간보호센터, 지역 복지관 등 특정 시설을 찾을 때 사용합니다.',
      schema: z.object({
        question: z.string(),
        facility_type: z.string(),
        userId: z.string(),
      }),
    },
  );

  const checkPolicyEligibility = tool(
    async (
      { policy_name, userId }: { policy_name: string; userId: string },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '자격 확인',
        content: '정책 조건과 사용자 정보를 비교하는 중입니다.',
        node: 'check_policy_eligibility',
        status: 'active',
      });
      const result = await services.searchPolicyEligibility(policy_name, userId, traceId ?? undefined);
      emitThink(traceId, {
        phase: '자격 확인',
        content: `${result.summary} 자격 판단 근거를 정리했습니다.`,
        node: 'check_policy_eligibility',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'check_policy_eligibility',
      description:
        '특정 정책의 신청 자격 조건과 상세 내용을 구조화해 조회합니다. "내가 이 정책 받을 수 있어?"처럼 특정 정책명이 언급될 때 사용합니다.',
      schema: z.object({
        policy_name: z.string(),
        userId: z.string(),
      }),
    },
  );

  const getUpcomingDeadlines = tool(
    async (
      { userId, days_ahead }: { userId: string; days_ahead: number },
      config?: RunnableConfig,
    ) => {
      const traceId = extractTraceId(config);
      emitThink(traceId, {
        phase: '마감 일정 조회',
        content: `향후 ${days_ahead}일 기준으로 접수 중이거나 임박한 공고를 찾는 중입니다.`,
        node: 'get_upcoming_deadlines',
        status: 'active',
      });
      const result = await services.getUpcomingDeadlines(userId, days_ahead, traceId ?? undefined);
      emitThink(traceId, {
        phase: '마감 일정 조회',
        content: `${result.summary} 일정 결과를 정리했습니다.`,
        node: 'get_upcoming_deadlines',
        status: 'done',
      });
      return serializeToolPayload(result);
    },
    {
      name: 'get_upcoming_deadlines',
      description:
        '현재 신청 접수 중이거나 곧 마감되는 청약·공고 목록을 조회합니다. "지금 신청 가능한 게 뭐야?"처럼 현재 접수 여부가 중요할 때 사용합니다.',
      schema: z.object({
        userId: z.string(),
        days_ahead: z.number().int().min(1).max(30).default(14),
      }),
    },
  );

  const tools = [
    searchWelfare,
    searchYouthPolicy,
    searchHousingSubscription,
    searchRentalSupport,
    searchWelfareFacility,
    checkPolicyEligibility,
    getUpcomingDeadlines,
  ];
  const toolNode = new ToolNode<GraphStateType>(tools);
  const llmWithTools = llm.bindTools(tools);

  function preRoute(state: GraphStateType): Partial<GraphStateType> {
    emitThink(state.traceId, {
      phase: '도구 선택',
      content: '질문에 맞는 검색 도구를 미리 선택하는 중입니다.',
      node: 'pre_route',
      status: 'active',
    });
    const decision = services.queryAnalysis.resolveSearchPreRoute({
      question: state.question,
      userId: state.userId,
      traceId: state.traceId,
    });

    if (!decision) {
      return {};
    }

    const toolCall = {
      id: uid(),
      name: decision.toolName,
      args: decision.args,
    };

    services.recordToolSelection(state.traceId, {
      source: 'PRE_ROUTE',
      toolName: decision.toolName,
      args: decision.args,
      detail: decision.detail,
    });

    emitThink(state.traceId, {
      phase: '도구 선택',
      content: decision.detail,
      node: decision.toolName,
      status: 'done',
    });

    return { messages: [new AIMessage({ content: '', tool_calls: [toolCall] })] };
  }

  function routeAfterPreRoute(state: GraphStateType): 'tools' | 'agent' {
    const last = state.messages[state.messages.length - 1];
    return (last as AIMessage).tool_calls?.length ? 'tools' : 'agent';
  }

  async function loadContext(state: GraphStateType): Promise<Partial<GraphStateType>> {
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

    const today = new Date()
      .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\. /g, '-')
      .replace('.', '');
    const age = profile?.birthDate ? services.calcAge(profile.birthDate) : '미입력';
    const region = profile?.sidoCode ? services.getSidoName(profile.sidoCode) : '미입력';

    const historyMessages: BaseMessage[] = rawHistory.map((message) =>
      message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
    );

    const userContextMessage = new HumanMessage(
      [
        '## 오늘 날짜',
        `${today} (이 날짜 이후 접수 기간이 유효한 정책·청약만 안내)`,
        '',
        '## 사용자 정보',
        `- 나이: ${age}세 | 거주지: ${region} | 가구형태: ${profile?.householdType ?? '미입력'}`,
        `- 직업: ${profile?.occupationType ?? '미입력'} | 소득: 중위소득 ${profile?.incomeBracket ?? '미입력'}% 이하 | 주거: ${profile?.isHomeowner ? '자가' : '무주택/임차'}`,
        `- userId: ${state.userId}`,
      ].join('\n'),
    );

    services.recordContext(state.traceId, {
      historyCount: rawHistory.length,
      profileSummary: profile
        ? {
            age,
            region,
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
        new SystemMessage(SEARCH_SYSTEM_PROMPT),
        userContextMessage,
        ...historyMessages,
        new HumanMessage(state.question),
      ],
    };
  }

  async function requestMissingInfo(state: GraphStateType): Promise<Partial<GraphStateType>> {
    emitThink(state.traceId, {
      phase: '질문 점검',
      content: '질문에 필요한 정보가 충분한지 확인하는 중입니다.',
      node: 'request_missing_info',
      status: 'active',
    });
    const clarification = services.queryAnalysis.getClarificationRequest({
      routeType: 'SEARCH',
      question: state.question,
      profile: state.profile,
    });

    if (!clarification) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '추가 정보 없이 바로 검색을 진행할 수 있습니다.',
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
        routeType: 'SEARCH',
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

  function routeAfterMissingInfo(state: GraphStateType): 'save_message' | 'pre_route' {
    return state.answer ? 'save_message' : 'pre_route';
  }

  async function agentNode(
    state: GraphStateType,
    config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    emitThink(state.traceId, {
      phase: '답변 전략 수립',
      content: '질문을 바탕으로 답변 전략과 도구 호출 여부를 판단하는 중입니다.',
      node: 'agent',
      status: 'active',
    });
    const stream = await llmWithTools.stream(state.messages, {
      ...config,
      runName: 'welfare-react-agent',
      tags: ['welfare-ai', 'react', 'langgraph'],
    });

    const chunks: AIMessageChunk[] = [];
    let hasToolCall = false;
    let textAccumulated = '';

    for await (const chunk of stream) {
      const aiChunk = chunk as AIMessageChunk;
      chunks.push(aiChunk);

      if (aiChunk.tool_call_chunks?.length) {
        hasToolCall = true;
      }

      if (!hasToolCall && typeof aiChunk.content === 'string' && aiChunk.content) {
        textAccumulated += aiChunk.content;
        state.streamCallback?.(aiChunk.content);
      }
    }

    if (chunks.length === 0) {
      const fallback = '응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      return { messages: [new AIMessage(fallback)], answer: fallback, skipSave: false };
    }

    const finalMessage = chunks.reduce((acc, chunk) => acc.concat(chunk));
    // traceId는 RunnableConfig.metadata로 자동 전파되므로 args에 별도 주입할 필요 없음.

    for (const toolCall of finalMessage.tool_calls ?? []) {
      services.recordToolSelection(state.traceId, {
        source: 'AGENT',
        toolName: toolCall.name,
        args: toolCall.args ?? {},
        detail: `LLM이 ${toolCall.name} 도구를 선택했습니다.`,
      });
    }

    emitThink(state.traceId, {
      phase: '답변 전략 수립',
      content: finalMessage.tool_calls?.length
        ? '관련 도구를 선택해 근거를 더 수집하고 있습니다.'
        : '바로 답변 초안을 생성하고 있습니다.',
      node: 'agent',
      status: 'done',
    });

    return {
      messages: [finalMessage],
      skipSave: false,
      ...(textAccumulated ? { answer: textAccumulated } : {}),
    };
  }

  function shouldContinue(state: GraphStateType): 'tools' | 'save_message' {
    if (state.answer) return 'save_message';
    const lastMessage = state.messages[state.messages.length - 1];
    if ((lastMessage as AIMessage).tool_calls?.length) return 'tools';
    return 'save_message';
  }

  async function verifyAnswer(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const detection = detectAnswerNeedsHitl(state.answer);
    if (!detection.needsHitl) return {};

    emitThink(state.traceId, {
      phase: 'HITL 재질문 판단',
      content: `답변이 ${detection.reason} 형태로 감지되어 선택형 재질문으로 전환합니다.`,
      node: 'verify_answer',
      status: 'active',
    });

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

    emitThink(state.traceId, {
      phase: 'HITL 재질문 판단',
      content: '선택형 질문을 전송했습니다.',
      node: 'verify_answer',
      status: 'done',
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

  async function saveMessage(state: GraphStateType): Promise<Partial<GraphStateType>> {
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

  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('pre_route', preRoute)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      pre_route: 'pre_route',
      save_message: 'save_message',
    })
    .addConditionalEdges('pre_route', routeAfterPreRoute, {
      tools: 'tools',
      agent: 'agent',
    })
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      save_message: 'verify_answer',
    })
    .addEdge('tools', 'agent')
    .addEdge('verify_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
