import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
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
import { getClarificationRequest } from './hitl.util';

// ── 프리라우팅: 명확한 단일 의도 키워드 ──────────────────────
// → LLM 호출 없이 바로 툴 주입 (첫 번째 agent 호출 500ms 절감)
const CLEAR_YOUTH = /청년수당|청년적금|청년도약계좌|청년희망적금|온통청년|청년내일채움|청년취업지원금|청년창업지원금|청년 정책 뭐|청년 지원금/;
const CLEAR_DEADLINE = /지금\s*신청\s*가능|현재\s*접수\s*중|마감\s*임박|신청\s*가능한\s*청약|오늘\s*청약/;
const CLEAR_HOUSING_SUB = /청약홈\s*공고|분양\s*공고|행복주택\s*청약|국민임대\s*청약|청약\s*일정|청약\s*접수\s*기간/;
const CLEAR_RENTAL = /주거급여\s*신청|버팀목\s*전세|전세자금\s*대출|월세\s*보조금|LH\s*임대단지|공공임대\s*입주/;
const CLEAR_FACILITY = /복지관\s*어디|시설\s*찾아|주간보호\s*센터|활동지원\s*기관|가까운\s*복지/;

const uid = () => `pre_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── 그래프 상태 ────────────────────────────────────────────────
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
});

type GraphStateType = typeof GraphState.State;

function formatDocs(docs: Document[]): string {
  if (docs.length === 0) return '관련 정책을 찾지 못했습니다.';
  return docs.map((doc, i) => `[정책 ${i + 1}]\n${doc.pageContent}`).join('\n\n---\n\n');
}

export interface RagServices {
  // 프로필
  getProfile: (userId: string) => Promise<UserProfile | null>;
  // Neo4j 온톨로지
  inferFromOntology: (profile: UserProfile, question: string, traceId?: string) => Promise<string[]>;
  enrichWithGraph: (policyIds: string[], traceId?: string) => Promise<string>;
  // Qdrant 검색
  searchVectors: (question: string, policyIds: string[], traceId?: string) => Promise<Document[]>;
  searchYouthPolicies: (question: string, traceId?: string) => Promise<Document[]>;
  searchByPolicyName: (policyName: string, traceId?: string) => Promise<Document[]>;
  // 청약·주거
  searchHousingSubscriptions: (question: string, sidoCode: string, traceId?: string) => Promise<Document[]>;
  searchRentalSupport: (question: string, sidoCode: string, traceId?: string) => Promise<Document[]>;
  // 복지 시설
  searchWelfareFacilities: (question: string, facilityType: string, sidoCode: string, traceId?: string) => Promise<Document[]>;
  // 마감 임박
  getUpcomingDeadlines: (sidoCode: string, traceId?: string) => Promise<Document[]>;
  // 대화 관리
  loadHistory: (sessionId: string) => Promise<Array<{ role: string; content: string }>>;
  saveMessage: (sessionId: string, role: string, content: string) => Promise<void>;
  recordContext: (
    traceId: string,
    input: { historyCount: number; profileSummary: Record<string, unknown> | null },
  ) => void;
  recordEvent: (
    traceId: string,
    input: { type: 'session' | 'context' | 'decision' | 'vector_search' | 'graph_walk' | 'answer' | 'error'; title: string; detail?: string | null; payload?: unknown },
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
  calcAge: (birthDate: string) => number;
  getSidoName: (code: string) => string;
}

export function createRagGraph(services: RagServices) {
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  // ── 도구 1: 일반 복지 정책 ────────────────────────────────────
  // Neo4j 온톨로지(프로필 매칭) → Qdrant 벡터 검색 → 그래프 인사이트 보강
  const searchWelfare = tool(
    async ({ question, userId, traceId }: { question: string; userId: string; traceId?: string }) => {
      const profile = await services.getProfile(userId);
      const policyIds = profile ? await services.inferFromOntology(profile, question, traceId) : [];
      const [docs, graphContext] = await Promise.all([
        services.searchVectors(question, policyIds, traceId),
        policyIds.length > 0 ? services.enrichWithGraph(policyIds.slice(0, 10), traceId) : Promise.resolve(''),
      ]);
      const docsText = formatDocs(docs);
      return graphContext ? `${docsText}\n\n## 그래프 인사이트\n${graphContext}` : docsText;
    },
    {
      name: 'search_welfare',
      description:
        '일반 복지 정책, 수당, 급여, 지원금, 서비스를 검색합니다. ' +
        '기초생활보장, 의료급여, 장애인 지원, 아동·보육, 교육비 지원, 취업지원, 노인 복지 등을 찾을 때 사용합니다. ' +
        '사용자 프로필(나이, 소득, 가구형태, 장애 여부 등)에 맞는 복지로 + 지역복지 정책을 반환합니다.',
      schema: z.object({
        question: z.string().describe('검색할 질문이나 키워드 (예: "장애인 활동지원 신청 방법", "기초연금 조건")'),
        userId: z.string().describe('사용자 ID (프로필 기반 맞춤 검색에 사용)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 2: 청년 전용 정책 ────────────────────────────────────
  // 청년센터 API 데이터 (1,624개) Qdrant 검색 (source: youth_center)
  const searchYouthPolicy = tool(
    async ({ question, traceId }: { question: string; traceId?: string }) => {
      const docs = await services.searchYouthPolicies(question, traceId);
      return formatDocs(docs);
    },
    {
      name: 'search_youth_policy',
      description:
        '청년(만 19~34세) 전용 정책을 청년센터 데이터에서 검색합니다. ' +
        '청년수당, 청년월세한시특별지원, 청년도약계좌, 청년적금, 청년 취업·창업 지원, ' +
        '청년 주거(청년전용 임대주택), 온통청년, 청년내일채움공제 등을 찾을 때 사용합니다.',
      schema: z.object({
        question: z.string().describe('검색할 청년정책 키워드 (예: "청년 월세 지원", "청년 창업 자금")'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 3: 청약·분양 공고 ────────────────────────────────────
  // Neo4j HousingAnnouncement + Qdrant applyhome/myhome_announcement
  const searchHousingSubscription = tool(
    async ({ question, userId, traceId }: { question: string; userId: string; traceId?: string }) => {
      const profile = await services.getProfile(userId);
      const sidoCode = profile?.sidoCode ?? '';
      const docs = await services.searchHousingSubscriptions(question, sidoCode, traceId);
      return formatDocs(docs);
    },
    {
      name: 'search_housing_subscription',
      description:
        '공공주택 청약·분양 공고를 검색합니다. ' +
        '행복주택, 국민임대, 공공분양, 신혼희망타운, LH 청약홈 공고, 마이홈 포털 공고를 찾을 때 사용합니다. ' +
        '청약 신청 방법, 청약 일정, 당첨자 발표, 청약 경쟁률, 청약 유형별 통계 등 청약 관련 질문에 사용합니다.',
      schema: z.object({
        question: z.string().describe('검색할 청약 관련 질문 (예: "행복주택 청약 신청", "서울 공공분양 공고")'),
        userId: z.string().describe('사용자 ID (거주 지역 기반 청약 필터링에 사용)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 4: 전세·월세 지원금 ─────────────────────────────────
  // Qdrant lh_housing (LH 임대단지) + bokjiro (주거급여, 전세자금)
  // Neo4j HousingComplex (LH 공공임대단지 상세)
  const searchRentalSupport = tool(
    async ({ question, userId, traceId }: { question: string; userId: string; traceId?: string }) => {
      const profile = await services.getProfile(userId);
      const sidoCode = profile?.sidoCode ?? '';
      const docs = await services.searchRentalSupport(question, sidoCode, traceId);
      return formatDocs(docs);
    },
    {
      name: 'search_rental_support',
      description:
        '전세·월세 지원금과 공공임대주택 정보를 검색합니다. ' +
        '주거급여, 전세자금대출, 청년월세한시특별지원(세입자 입장), LH 공공임대단지, ' +
        '매입임대, 전세임대, 버팀목 전세자금 대출을 찾을 때 사용합니다. ' +
        '청약(분양·신청) 공고가 아닌, 이미 운영 중인 임대주택·지원금을 원할 때 사용합니다.',
      schema: z.object({
        question: z.string().describe('검색할 전세·월세 지원 키워드 (예: "주거급여 신청", "LH 임대주택 입주 방법")'),
        userId: z.string().describe('사용자 ID (지역 기반 검색에 사용)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 5: 복지 시설 찾기 ───────────────────────────────────
  // Qdrant welfare_facility + Neo4j WelfareFacility
  const searchWelfareFacility = tool(
    async ({
      question,
      facility_type,
      userId,
    }: {
      question: string;
      facility_type: string;
      userId: string;
      traceId?: string;
    }) => {
      const profile = await services.getProfile(userId);
      const sidoCode = profile?.sidoCode ?? '';
      const docs = await services.searchWelfareFacilities(question, facility_type, sidoCode, traceId);
      return formatDocs(docs);
    },
    {
      name: 'search_welfare_facility',
      description:
        '복지 시설(기관)을 검색합니다. ' +
        '장애인 활동지원 기관, 노인 주간보호센터, 아동청소년 상담센터, 지역 복지관, ' +
        '정신건강 복지센터, 자활센터 등 특정 시설을 찾을 때 사용합니다.',
      schema: z.object({
        question: z.string().describe('검색할 시설 관련 질문 (예: "장애인 활동지원 기관 어디있어", "노인 주간보호센터 신청")'),
        facility_type: z
          .string()
          .describe(
            '시설 유형 키워드 (예: "장애인", "노인", "아동", "정신건강", "자활"). 모를 경우 빈 문자열("")',
          ),
        userId: z.string().describe('사용자 ID (거주 지역 기반 검색에 사용)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 6: 정책 적격 조건 상세 조회 ─────────────────────────
  // 특정 정책 이름으로 검색 → 조건·신청방법 상세 반환
  // (LLM이 system prompt의 사용자 정보와 비교해 적격 여부 판단)
  const checkPolicyEligibility = tool(
    async ({ policy_name, userId, traceId }: { policy_name: string; userId: string; traceId?: string }) => {
      const [docs, profile] = await Promise.all([
        services.searchByPolicyName(policy_name, traceId),
        services.getProfile(userId),
      ]);

      if (docs.length === 0) return `"${policy_name}" 정책을 찾지 못했습니다.`;

      const profileSummary = profile
        ? [
            `나이: ${profile.birthDate ? services.calcAge(profile.birthDate) : '미입력'}세`,
            `거주지: ${profile.sidoCode ? services.getSidoName(profile.sidoCode) : '미입력'}`,
            `소득: 중위소득 ${profile.incomeBracket ?? '미입력'}% 이하`,
            `가구형태: ${profile.householdType ?? '미입력'}`,
            `주택: ${profile.isHomeowner ? '자가' : '무주택'}`,
            profile.isDisabled ? '장애인' : '',
            profile.isVeteran ? '국가유공자' : '',
          ]
            .filter(Boolean)
            .join(', ')
        : '프로필 미설정';

      return `## 사용자 정보\n${profileSummary}\n\n## 정책 상세\n${formatDocs(docs)}`;
    },
    {
      name: 'check_policy_eligibility',
      description:
        '특정 정책의 신청 자격 조건과 상세 내용을 조회합니다. ' +
        '"내가 이 정책 받을 수 있어?", "○○○ 자격 조건 알려줘"처럼 특정 정책 이름이 언급될 때 사용합니다. ' +
        '검색 결과와 사용자 프로필을 바탕으로 적격 여부를 판단합니다.',
      schema: z.object({
        policy_name: z.string().describe('조회할 정책 이름 (예: "청년도약계좌", "기초생활수급자 의료급여")'),
        userId: z.string().describe('사용자 ID (프로필 조회에 사용)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
      }),
    },
  );

  // ── 도구 7: 신청 마감 임박 청약·정책 목록 ───────────────────
  // Neo4j HousingAnnouncement 날짜 필터 (오늘 기준 청약 접수 중)
  const getUpcomingDeadlines = tool(
    async ({ userId, days_ahead, traceId }: { userId: string; days_ahead: number; traceId?: string }) => {
      const profile = await services.getProfile(userId);
      const sidoCode = profile?.sidoCode ?? '';
      const docs = await services.getUpcomingDeadlines(sidoCode, traceId);
      if (docs.length === 0) return '현재 신청 가능한 청약·정책을 찾지 못했습니다.';
      const header = `## 현재 청약 접수 중 (${days_ahead}일 이내 마감 포함)\n\n`;
      return header + formatDocs(docs);
    },
    {
      name: 'get_upcoming_deadlines',
      description:
        '현재 신청 접수 중이거나 곧 마감되는 청약·공모 목록을 조회합니다. ' +
        '"지금 신청할 수 있는 게 뭐야?", "마감 임박한 청약 알려줘", "지금 청약 가능한 것"처럼 ' +
        '현재 신청 가능 여부가 중요할 때 사용합니다.',
      schema: z.object({
        userId: z.string().describe('사용자 ID (거주 지역 필터링에 사용)'),
        days_ahead: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(14)
          .describe('앞으로 며칠 이내 마감까지 포함할지 (기본값 14일)'),
        traceId: z.string().optional().describe('관리자 디버깅용 추적 ID'),
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

  // ── 노드 0: 프리라우팅 ─────────────────────────────────────────
  // 명확한 단일 의도 → LLM 없이 툴 주입 (첫 번째 agent LLM 호출 절감)
  // 복합 질문·모호한 질문은 빈 반환 → agent가 결정
  function preRoute(state: GraphStateType): Partial<GraphStateType> {
    const q = state.question;

    type ToolCall = { id: string; name: string; args: Record<string, unknown> };
    let toolCall: ToolCall | null = null;

    if (CLEAR_DEADLINE.test(q)) {
      toolCall = {
        id: uid(),
        name: 'get_upcoming_deadlines',
        args: { userId: state.userId, days_ahead: 14, traceId: state.traceId },
      };
    } else if (CLEAR_YOUTH.test(q) && !CLEAR_HOUSING_SUB.test(q)) {
      toolCall = { id: uid(), name: 'search_youth_policy', args: { question: q, traceId: state.traceId } };
    } else if (CLEAR_HOUSING_SUB.test(q) && !CLEAR_YOUTH.test(q)) {
      toolCall = {
        id: uid(),
        name: 'search_housing_subscription',
        args: { question: q, userId: state.userId, traceId: state.traceId },
      };
    } else if (CLEAR_RENTAL.test(q)) {
      toolCall = {
        id: uid(),
        name: 'search_rental_support',
        args: { question: q, userId: state.userId, traceId: state.traceId },
      };
    } else if (CLEAR_FACILITY.test(q)) {
      toolCall = { id: uid(), name: 'search_welfare_facility', args: { question: q, facility_type: '', userId: state.userId, traceId: state.traceId } };
    }

    if (!toolCall) return {}; // 모호/복합 → agent에게 위임
    services.recordToolSelection(state.traceId, {
      source: 'PRE_ROUTE',
      toolName: toolCall.name,
      args: toolCall.args,
      detail: `정규식 규칙이 질문을 ${toolCall.name}으로 바로 라우팅했습니다.`,
    });
    return { messages: [new AIMessage({ content: '', tool_calls: [toolCall] })] };
  }

  function routeAfterPreRoute(state: GraphStateType): 'tools' | 'agent' {
    const last = state.messages[state.messages.length - 1];
    return (last as AIMessage).tool_calls?.length ? 'tools' : 'agent';
  }

  // ── 노드 1: 컨텍스트 로드 (프로필 + 대화 히스토리) ──────────
  async function loadContext(state: GraphStateType): Promise<Partial<GraphStateType>> {
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

    const systemPrompt = `당신은 대한민국 복지·지원금 정책 전문 AI 컨설턴트입니다. 사용자 맞춤 정책을 찾아 신청까지 도와줍니다.

## 오늘 날짜
${today} (이 날짜 이후 접수 기간이 유효한 정책·청약만 안내)

## 사용자 정보
- 나이: ${age}세 | 거주지: ${region} | 가구형태: ${profile?.householdType ?? '미입력'}
- 직업: ${profile?.occupationType ?? '미입력'} | 소득: 중위소득 ${profile?.incomeBracket ?? '미입력'}% 이하 | 주거: ${profile?.isHomeowner ? '자가' : '무주택/임차'}
- userId: ${state.userId}

## 도구 사용 규칙
⚡ **여러 도구가 필요하면 반드시 한 번에 동시 호출하세요. 순차 호출 금지.**

| 상황 | 사용 도구 |
|------|----------|
| 일반 복지·수당·급여·서비스 | search_welfare |
| 청년 전용 (만 19~34세) | search_youth_policy |
| 청약·분양 공고·청약 일정 | search_housing_subscription |
| 전세·월세 지원·LH임대·주거급여 | search_rental_support |
| 복지 시설·기관 위치 | search_welfare_facility |
| "이 정책 받을 수 있어?" | check_policy_eligibility |
| 지금 신청 가능한 청약 | get_upcoming_deadlines |
| 복합 질문 | 관련 도구 **동시에** 모두 호출 |

## 정확도 규칙 (반드시 준수)
1. 검색 결과에 있는 내용만 답변합니다. **없는 내용은 절대 추측하거나 만들지 마세요.**
2. 정책명·금액·신청링크는 **검색된 원본 그대로** 사용합니다.
3. 검색 결과가 없으면 솔직하게 "찾지 못했습니다"라고 안내하고 대안을 제시합니다.
4. 사용자 조건(나이·소득·지역)에 맞지 않는 정책은 제외하거나 조건 불일치를 명시합니다.

## 답변 형식
### 📋 [정책명]
- **지원내용**: 구체적인 금액·서비스
- **신청대상**: 조건 요약 (대상 명시)
- **신청방법**: 온라인/방문/전화 등
- **신청링크**: [바로 신청하기](URL)
- **문의**: 담당기관·전화번호 (있는 경우)

정책 여러 개면 사용자 조건에 가장 부합하는 것부터 안내합니다.
마감일이 있으면 **굵게 강조**하고, 이미 종료된 청약은 "접수 종료" 명시 후 우선순위 낮춥니다.
마지막에 반드시 "💡 **핵심 요약**: ..." 한 줄 추가.`;

    const historyMessages: BaseMessage[] = rawHistory.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
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

    return {
      profile,
      messages: [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        new HumanMessage(state.question),
      ],
    };
  }

  async function requestMissingInfo(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const clarification = getClarificationRequest({
      routeType: 'SEARCH',
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
        routeType: 'SEARCH',
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

  function routeAfterMissingInfo(state: GraphStateType): 'save_message' | 'pre_route' {
    return state.answer ? 'save_message' : 'pre_route';
  }

  // ── 노드 2: ReAct 에이전트 (스트리밍) ────────────────────────
  // - 도구 호출 중에는 streamCallback 전송 안 함
  // - 최종 답변 생성 시에만 사용자에게 스트리밍
  async function agentNode(
    state: GraphStateType,
    config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
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

      // 최종 답변 생성 시에만 사용자에게 스트리밍
      if (!hasToolCall && typeof aiChunk.content === 'string' && aiChunk.content) {
        textAccumulated += aiChunk.content;
        state.streamCallback?.(aiChunk.content);
      }
    }

    if (chunks.length === 0) {
      const errMsg = '응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      return { messages: [new AIMessage(errMsg)], answer: errMsg };
    }

    // 모든 청크를 하나의 AIMessage로 병합 (tool_calls 자동 집계)
    const finalMessage = chunks.reduce((acc, chunk) => acc.concat(chunk));
    if (finalMessage.tool_calls?.length) {
      finalMessage.tool_calls = finalMessage.tool_calls.map((toolCall) => ({
        ...toolCall,
        args: { ...(toolCall.args ?? {}), traceId: state.traceId },
      }));
    }

    for (const toolCall of finalMessage.tool_calls ?? []) {
      services.recordToolSelection(state.traceId, {
        source: 'AGENT',
        toolName: toolCall.name,
        args: toolCall.args ?? {},
        detail: `LLM이 ${toolCall.name} 도구를 선택했습니다.`,
      });
    }

    return {
      messages: [finalMessage],
      ...(textAccumulated ? { answer: textAccumulated } : {}),
    };
  }

  // ── 라우팅: tool call → tools 노드, 최종 답변 → 저장 ─────────
  function shouldContinue(state: GraphStateType): 'tools' | 'save_message' {
    if (state.answer) return 'save_message';
    const lastMessage = state.messages[state.messages.length - 1];
    if ((lastMessage as AIMessage).tool_calls?.length) return 'tools';
    return 'save_message';
  }

  // ── 노드 3: 메시지 저장 ───────────────────────────────────────
  async function saveMessage(state: GraphStateType): Promise<Partial<GraphStateType>> {
    if (state.sessionId && state.answer) {
      await services.saveMessage(state.sessionId, 'assistant', state.answer);
    }
    return {};
  }

  return new StateGraph(GraphState)
    .addNode('load_context', loadContext)
    .addNode('request_missing_info', requestMissingInfo)
    .addNode('pre_route', preRoute)          // 명확한 의도 → LLM 없이 툴 주입
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_context')
    .addEdge('load_context', 'request_missing_info')
    .addConditionalEdges('request_missing_info', routeAfterMissingInfo, {
      pre_route: 'pre_route',
      save_message: 'save_message',
    })
    .addConditionalEdges('pre_route', routeAfterPreRoute, {
      tools: 'tools',                        // 명확한 의도 → 바로 툴 실행
      agent: 'agent',                        // 모호/복합 → LLM이 결정
    })
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      save_message: 'save_message',
    })
    .addEdge('tools', 'agent')
    .addEdge('save_message', END)
    .compile();
}
