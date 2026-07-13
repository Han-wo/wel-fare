import { StateGraph, END, START, Annotation, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  ToolMessage,
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
import { assessNamedProgramCoverage, type RetrievedDoc } from './retrieval-confidence';
import { checkAnswerGrounding } from './answer-grounding';
import { hasCalledTool, isToolBudgetExhausted, MAX_TOOL_ROUNDS } from './tool-budget';
import { buildPendingHitlMeta, type PendingHitl } from './hitl-resume';
import { createAwaitHitlNode, type HitlInterruptPayload } from './hitl-interrupt';
import { formatHitlFactsLine } from './profile-facts';
// 동적 사용자 정보(오늘 날짜/age/region/userId)는 별도 메시지로 분리해 prompt caching 적중률을 높인다.
import {
  BUDGET_EXHAUSTED_INSTRUCTION,
  GROUNDED_REPAIR_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
} from './prompts';
import { checkSearchAnswerFormat } from './answer-format';
import {
  buildDeterministicPolicyCorrection,
  buildDocsDigest,
  formatCorrectionAppendix,
} from './grounded-repair';

const uid = () => `pre_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
  retrievalLowConfidence: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  // HITL 보충 답변으로 재개된 턴. 클래리피케이션을 이미 한 번 했으므로
  // 이 턴에서는 재질문 없이 가진 정보로 끝까지 진행한다 (ask-at-most-once).
  hitlResumed: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  // 저신뢰 검색에 대한 기계 재시도(retry_search)는 턴당 1회만.
  retrievalRetryDone: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
});

type GraphStateType = typeof GraphState.State;

export interface RagGraphServices {
  queryAnalysis: Pick<
    QueryAnalysisService,
    | 'resolveSearchPreRoute'
    | 'getClarificationRequest'
    | 'selectApplicationSources'
    | 'extractNamedPrograms'
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
      source: 'PRE_ROUTE' | 'AGENT' | 'RETRY';
      toolName: string;
      args: Record<string, unknown>;
      detail: string;
    },
  ) => void;
  emitThink: (traceId: string, input: RagThinkPayload) => void;
  // 답변 토큰·HITL 설문은 traceId 기반 레지스트리로 내보낸다 (rag-answer-stream.service).
  emitToken: (traceId: string, token: string) => void;
  emitHitl: (traceId: string, questionnaire: HitlQuestionnaire) => void;
  calcAge: (birthDate: string) => number;
  getSidoName: (code: string) => string;
}

function serializeToolPayload(result: RetrievalResult | EligibilityRetrievalResult) {
  // 들여쓰기 없이 직렬화해 LLM 입력 토큰을 ~30% 절감.
  return JSON.stringify(toStructuredToolPayload(result));
}

// 근거에서 확인되지 않은 신청링크에 대한 사용자 보호 캐비엇. 답변을 차단하지 않고
// 끝에 경고를 덧붙여, 가짜 신청 페이지로의 유도를 차단한다.
function buildLinkCaveat(links: string[]): string {
  return [
    '',
    '',
    '> ⚠️ **확인 안내**: 아래 링크는 검색된 공식 근거에서 확인되지 않았습니다.',
    '> 신청 전 반드시 정부24·복지로 등 공식 사이트에서 직접 확인하세요.',
    ...links.map((url) => `> - ${url}`),
  ].join('\n');
}

// 도구 실행 결과(ToolMessage)에서 검색된 문서만 모은다. payload의 query/summary
// 에는 질문이 echo되므로 items의 title/content만 취한다.
function collectRetrievedDocs(messages: BaseMessage[]): RetrievedDoc[] {
  const docs: RetrievedDoc[] = [];
  for (const message of messages) {
    if (!(message instanceof ToolMessage)) continue;
    try {
      const parsed = JSON.parse(String(message.content)) as {
        items?: Array<{ content?: unknown; title?: unknown }>;
      };
      for (const item of parsed.items ?? []) {
        docs.push({
          title: typeof item.title === 'string' ? item.title : null,
          content: typeof item.content === 'string' ? item.content : null,
        });
      }
    } catch {
      docs.push({ content: String(message.content) });
    }
  }
  return docs;
}

export function createRagGraph(
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
        '일반 복지 정책, 수당, 급여, 지원금, 서비스를 검색합니다. 기초생활보장, 의료급여, 장애인 지원, 아동·보육, 교육비 지원, 취업지원, 노인 복지 등 "어떤 정책이 있는지" 찾는 단계에 사용합니다. 예: "장애인 지원 뭐 있어?", "출산 지원금 알려줘". 특정 정책명의 자격 확인이 목적이면 check_policy_eligibility를 사용합니다.',
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
        '청년(만 19~34세) 전용 정책을 검색합니다. 청년수당, 청년월세, 청년도약계좌, 청년 취업·창업 지원 등을 찾을 때 사용합니다. 예: "청년 정책 뭐 있어?". 청년+청약처럼 주거 공고와 겹치는 질문이면 search_housing_subscription과 함께 호출합니다.',
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
        '특정 정책의 신청 자격 조건과 상세 내용을 구조화해 조회합니다. "내가 청년월세 받을 수 있어?"처럼 질문에 특정 정책명이 있고 자격·조건 확인이 목적일 때 사용합니다. 정책을 탐색하는 단계라면 search_welfare를 사용합니다.',
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

    const factsLine = formatHitlFactsLine(profile);
    const userContextMessage = new HumanMessage(
      [
        '## 오늘 날짜',
        `${today} (이 날짜 이후 접수 기간이 유효한 정책·청약만 안내)`,
        '',
        '## 사용자 정보',
        `- 나이: ${age}세 | 거주지: ${region} | 가구형태: ${profile?.householdType ?? '미입력'}`,
        `- 직업: ${profile?.occupationType ?? '미입력'} | 소득: 중위소득 ${profile?.incomeBracket ?? '미입력'}% 이하 | 주거: ${profile?.isHomeowner ? '자가' : '무주택/임차'}`,
        ...(factsLine ? [factsLine] : []),
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
    if (state.hitlResumed) {
      emitThink(state.traceId, {
        phase: '질문 점검',
        content: '보충 답변을 반영해 재질문 없이 검색을 진행합니다.',
        node: 'request_missing_info',
        status: 'done',
      });
      return {};
    }

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
      routeType: 'SEARCH',
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

  function routeAfterMissingInfo(state: GraphStateType): 'save_hitl_message' | 'pre_route' {
    return state.pendingHitl ? 'save_hitl_message' : 'pre_route';
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

    // 예산 소진 시 도구를 떼어낸 LLM으로 전환해 텍스트 답변을 강제한다.
    // tools 노드 이후에는 항상 agent(또는 clarification)로 돌아오므로 이 지점이
    // 루프의 유일한 예산 집행 지점이다.
    const budgetExhausted = isToolBudgetExhausted(state.messages);
    if (budgetExhausted) {
      services.recordEvent(state.traceId, {
        type: 'decision',
        title: '도구 호출 예산 소진',
        detail: `도구 호출 ${MAX_TOOL_ROUNDS}라운드를 모두 사용해 수집된 근거만으로 답변을 생성합니다.`,
        payload: { maxToolRounds: MAX_TOOL_ROUNDS },
      });
      emitThink(state.traceId, {
        phase: '답변 전략 수립',
        content: '도구 호출 한도에 도달해 지금까지 수집한 근거로 답변을 정리합니다.',
        node: 'agent',
        status: 'active',
      });
    }

    const model = budgetExhausted ? llm : llmWithTools;
    const input = budgetExhausted
      ? [...state.messages, new HumanMessage(BUDGET_EXHAUSTED_INSTRUCTION)]
      : state.messages;

    const stream = await model.stream(input, {
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
        services.emitToken(state.traceId, aiChunk.content);
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

  // 검색 직후 신뢰도 게이트: 질문이 특정 정책명을 지목했는데 도구 검색 결과 어디에도
  // 그 이름이 없으면("엔티티 부재") 약한 답변 대신 HITL 재질문으로 전환한다.
  // 점수 절대값은 한국어+임베딩 특성상 변별력이 약해 신호로 쓰지 않는다.
  function assessRetrieval(state: GraphStateType): Partial<GraphStateType> {
    const namedPrograms = services.queryAnalysis.extractNamedPrograms(state.question);
    if (namedPrograms.length === 0) {
      return { retrievalLowConfidence: false };
    }

    const docs = collectRetrievedDocs(state.messages);
    const assessment = assessNamedProgramCoverage(namedPrograms, docs);
    const found = !assessment.lowConfidence;

    emitThink(state.traceId, {
      phase: '검색 신뢰도 점검',
      content: found
        ? `지목된 정책(${namedPrograms.join(', ')})을 검색 결과에서 확인했습니다.`
        : `지목된 정책(${namedPrograms.join(', ')})을 검색 결과에서 찾지 못해 재질문으로 전환합니다.`,
      node: 'assess_retrieval',
      status: 'done',
    });

    if (!found) {
      services.recordEvent(state.traceId, {
        type: 'decision',
        title: '검색 신뢰도 부족 — HITL 전환',
        detail: `질문이 지목한 정책(${namedPrograms.join(', ')})이 검색 결과에 없어 재질문합니다.`,
        payload: { namedPrograms, reason: 'entity_absent' },
      });
    }

    return { retrievalLowConfidence: !found };
  }

  function routeAfterAssess(
    state: GraphStateType,
  ): 'agent' | 'request_clarification' | 'retry_search' {
    // 재개된 턴은 저신뢰여도 재질문 루프 대신 가진 근거로 답변까지 진행한다.
    if (state.hitlResumed) return 'agent';
    if (!state.retrievalLowConfidence) return 'agent';

    // 사용자를 부르기 전에 기계가 먼저 1회 재시도한다. search_welfare의
    // 렉시컬 arm이 정책명 정확 매치를 하므로, 아직 안 불렀다면 그쪽에서
    // 지목된 정책을 찾을 가능성이 있다. 이미 불렀다면 재시도 무의미 → HITL.
    if (!state.retrievalRetryDone && !hasCalledTool(state.messages, 'search_welfare')) {
      return 'retry_search';
    }
    return 'request_clarification';
  }

  // 저신뢰 검색의 기계 재시도: 정책명 정확 매치(렉시컬 arm)를 가진
  // search_welfare로 원 질문을 재검색한다. LLM 없이 결정적으로 동작한다.
  function retrySearch(state: GraphStateType): Partial<GraphStateType> {
    emitThink(state.traceId, {
      phase: '검색 재시도',
      content: '지목된 정책을 찾지 못해 통합 복지 검색으로 한 번 더 찾아봅니다.',
      node: 'retry_search',
      status: 'active',
    });

    services.recordEvent(state.traceId, {
      type: 'decision',
      title: '검색 재시도',
      detail: '지목된 정책이 검색 결과에 없어 search_welfare(렉시컬 매치 포함)로 재검색합니다.',
      payload: { toolName: 'search_welfare' },
    });
    services.recordToolSelection(state.traceId, {
      source: 'RETRY',
      toolName: 'search_welfare',
      args: { question: state.question },
      detail: '저신뢰 검색 재시도가 search_welfare를 선택했습니다.',
    });

    return {
      retrievalRetryDone: true,
      messages: [
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: uid(),
              name: 'search_welfare',
              args: { question: state.question, userId: state.userId },
            },
          ],
        }),
      ],
    };
  }

  async function requestClarification(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const questionnaire = await services.hitlSuggestion.buildRecoveryQuestionnaire({
      question: state.question,
      profile: state.profile,
      retrieval: null,
    });

    services.emitHitl(state.traceId, questionnaire);

    const message =
      '요청하신 내용을 정확히 찾지 못했어요. 아래에서 조건을 골라주시면 그 기준으로 다시 찾아드릴게요.';
    services.emitToken(state.traceId, message);

    const pending: PendingHitl = {
      originalQuestion: state.question,
      routeType: 'SEARCH',
      reason: 'retrieval_entity_absent',
      source: 'assess_retrieval',
      questionnaireId: questionnaire.id,
      threadId: state.traceId,
    };
    return {
      messages: [new AIMessage(message)],
      answer: message,
      skipSave: false,
      hitlMeta: buildPendingHitlMeta(pending),
      pendingHitl: { questionnaire, pending },
    };
  }

  const REPAIR_TIMEOUT_MS = 6000;

  // 근거 없는 정책명에 대한 정정 부록 생성. LLM 실패/타임아웃 시 결정적 문구.
  async function buildRepairAppendix(
    answer: string,
    ungroundedPolicyNames: string[],
    docs: RetrievedDoc[],
  ): Promise<{ text: string; mode: 'llm' | 'deterministic' }> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), REPAIR_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        llm.invoke([
          new SystemMessage(GROUNDED_REPAIR_SYSTEM_PROMPT),
          new HumanMessage(
            [
              '## 근거 문서 목록',
              buildDocsDigest(docs.map((doc) => doc.title)),
              '',
              '## 확인되지 않은 정책명',
              ungroundedPolicyNames.map((name) => `- ${name}`).join('\n'),
              '',
              '## 답변 끝부분',
              answer.slice(-1500),
            ].join('\n'),
          ),
        ]),
        timeout,
      ]);

      const text = typeof result?.content === 'string' ? result.content.trim() : '';
      if (text) {
        return { text: formatCorrectionAppendix(text), mode: 'llm' };
      }
    } catch {
      // 아래 결정적 폴백으로 진행한다.
    } finally {
      if (timer) clearTimeout(timer);
    }

    return {
      text: buildDeterministicPolicyCorrection(ungroundedPolicyNames),
      mode: 'deterministic',
    };
  }

  async function verifyAnswer(state: GraphStateType): Promise<Partial<GraphStateType>> {
    // 그라운딩 검증: 답변의 신청링크/정책명이 실제 근거에 있는지 검사한다.
    // 근거 없는 신청링크는 사용자 보호를 위해 캐비엇을 덧붙인다(저위험 행동).
    // 정책명/금액은 trace 기록만(관찰).
    const docs = collectRetrievedDocs(state.messages);
    let answerOverride: string | undefined;
    if (state.answer && docs.length > 0) {
      const grounding = checkAnswerGrounding(state.answer, docs);
      if (!grounding.grounded) {
        emitThink(state.traceId, {
          phase: '근거 검증',
          content: `근거에 없는 주장 감지(링크 ${grounding.ungrounded.links.length}, 정책명 ${grounding.ungrounded.policyNames.length}).`,
          node: 'verify_answer',
          status: 'done',
        });
        services.recordEvent(state.traceId, {
          type: 'error',
          title: '답변 그라운딩 경고',
          detail: '답변에 검색 근거로 뒷받침되지 않는 링크/정책명이 포함되어 있습니다.',
          payload: { ungrounded: grounding.ungrounded },
        });

        if (grounding.ungrounded.links.length > 0) {
          const caveat = buildLinkCaveat(grounding.ungrounded.links);
          services.emitToken(state.traceId, caveat);
          answerOverride = state.answer + caveat;
        }

        // 근거 없는 정책명: 본문은 이미 스트리밍됐으므로 정정 부록을 덧붙인다.
        // LLM 정정이 실패하면 결정적 문구로 폴백 — 어느 쪽이든 부록은 나간다.
        if (grounding.ungrounded.policyNames.length > 0) {
          const appendix = await buildRepairAppendix(
            state.answer,
            grounding.ungrounded.policyNames,
            docs,
          );
          services.emitToken(state.traceId, appendix.text);
          answerOverride = (answerOverride ?? state.answer) + appendix.text;

          services.recordEvent(state.traceId, {
            type: 'decision',
            title: '답변 정정 부록',
            detail: `근거 없는 정책명 ${grounding.ungrounded.policyNames.length}건에 정정 안내를 덧붙였습니다.`,
            payload: { policyNames: grounding.ungrounded.policyNames, mode: appendix.mode },
          });
        }
      }
    }

    // 형식 준수 관찰(차단 없음): 프롬프트 변경이 형식 준수율에 미치는 영향을
    // rag_traces 집계로 추적한다.
    if (state.answer) {
      const format = checkSearchAnswerFormat(state.answer);
      if (!format.compliant) {
        services.recordEvent(state.traceId, {
          type: 'decision',
          title: '답변 형식 경고',
          detail: format.violations.join(', '),
          payload: { route: 'SEARCH', violations: format.violations },
        });
      }
    }

    const detection = detectAnswerNeedsHitl(state.answer);
    if (!detection.needsHitl || state.hitlResumed) {
      return answerOverride ? { answer: answerOverride } : {};
    }

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

    services.emitHitl(state.traceId, questionnaire);

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

    const pending: PendingHitl = {
      originalQuestion: state.question,
      routeType: 'SEARCH',
      reason: detection.reason ?? 'unknown',
      source: 'verify_answer',
      questionnaireId: questionnaire.id,
      threadId: state.traceId,
    };
    return {
      ...(answerOverride ? { answer: answerOverride } : {}),
      hitlMeta: buildPendingHitlMeta(pending),
      pendingHitl: { questionnaire, pending },
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

  function routeAfterVerify(state: GraphStateType): 'save_hitl_message' | 'save_message' {
    return state.pendingHitl ? 'save_hitl_message' : 'save_message';
  }

  // save_hitl_message는 save_message와 같은 저장 로직이지만, 저장 후 END가 아니라
  // await_hitl로 이어져 interrupt()로 그래프를 멈춘다. 보충 답변이 오면
  // Command({resume})가 await_hitl부터 재개해 pre_route→agent 루프로 되돌아간다.
  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('pre_route', preRoute)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('assess_retrieval', assessRetrieval)
    .addNode('retry_search', retrySearch)
    .addNode('request_clarification', requestClarification)
    .addNode('verify_answer', verifyAnswer)
    .addNode('save_message', saveMessage)
    .addNode('save_hitl_message', saveMessage)
    .addNode('await_hitl', createAwaitHitlNode<GraphStateType>(services))
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      pre_route: 'pre_route',
      save_hitl_message: 'save_hitl_message',
    })
    .addConditionalEdges('pre_route', routeAfterPreRoute, {
      tools: 'tools',
      agent: 'agent',
    })
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      save_message: 'verify_answer',
    })
    .addEdge('tools', 'assess_retrieval')
    .addConditionalEdges('assess_retrieval', routeAfterAssess, {
      agent: 'agent',
      retry_search: 'retry_search',
      request_clarification: 'request_clarification',
    })
    .addEdge('retry_search', 'tools')
    .addEdge('request_clarification', 'save_hitl_message')
    .addConditionalEdges('verify_answer', routeAfterVerify, {
      save_hitl_message: 'save_hitl_message',
      save_message: 'save_message',
    })
    .addEdge('save_hitl_message', 'await_hitl')
    .addEdge('await_hitl', 'pre_route')
    .addEdge('save_message', END)
    .compile({ checkpointer });
}
