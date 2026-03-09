import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { traceable } from 'langsmith/traceable';
import type { UserProfile } from '@welfare-ai/shared-types';

const GraphState = Annotation.Root({
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  profile: Annotation<UserProfile | null>(),
  chatHistory: Annotation<BaseMessage[]>(),
  candidatePolicyIds: Annotation<string[]>(),
  documents: Annotation<Document[]>(),
  filteredDocuments: Annotation<Document[]>(),
  graphContext: Annotation<string>(),
  answer: Annotation<string>(),
  streamCallback: Annotation<((token: string) => void) | null>(),
});

type GraphStateType = typeof GraphState.State;

const RAG_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `당신은 대한민국 복지·지원금 정책 전문 AI 컨설턴트입니다. 사용자에게 맞는 정책을 찾아 신청까지 도와줍니다.

## 오늘 날짜
{today}

## 사용자 정보
- 나이: {age}세 | 거주지: {region} | 가구형태: {household}
- 직업: {occupation} | 소득: 중위소득 {income}% 이하 | 주거: {housing}

## 검색된 정책 정보
{context}

## 그래프 기반 추가 인사이트
{graphContext}

## 답변 작성 규칙
1. **정책 정보에 있는 내용만** 사용합니다. 없는 내용은 추측하지 마세요.
2. 이전 대화 내용을 참고하여 맥락에 맞게 답변합니다.
3. 사용자 조건(나이·소득·지역·가구형태)에 맞는 정책만 선별해 안내합니다.
4. 각 정책은 아래 형식으로 작성합니다:

### 📋 [정책명]
- **지원내용**: 구체적인 지원 금액·서비스
- **신청대상**: 해당 조건 요약 (대상 생애주기·그룹 명시)
- **제공 지역**: 전국 또는 해당 지역 명시
- **신청방법**: 온라인/방문/전화 등
- **신청링크**: [바로 신청하기](URL) ← 반드시 [신청링크] 필드 URL 사용
- **문의**: 담당기관 또는 전화번호 (있는 경우)

5. 정책이 여러 개면 사용자 조건에 가장 부합하는 것부터 순서대로 안내합니다.
6. 신청 기간·마감일이 있으면 강조하고, 오늘 날짜 기준으로 이미 종료된 청약은 "접수 종료"로 명시하며 우선순위를 낮춥니다.
7. 그래프 인사이트의 [연관 정책]이 있으면 마지막에 "함께 알아두면 좋은 정책"으로 간략히 소개합니다.
8. 정책이 없거나 조건 미달이면 솔직하게 안내하고 대안을 제시합니다.
9. 마지막에 한 줄 요약을 작성합니다: "💡 **핵심 요약**: ..."`,
  ],
  new MessagesPlaceholder('history'),
  ['human', '{question}'],
]);

export function createRagGraph(services: {
  getProfile: (userId: string) => Promise<UserProfile | null>;
  inferFromOntology: (profile: UserProfile, question: string) => Promise<string[]>;
  searchVectors: (question: string, policyIds: string[]) => Promise<Document[]>;
  searchHousing: (question: string, sidoCode: string) => Promise<Document[]>;
  enrichWithGraph: (policyIds: string[]) => Promise<string>;
  loadHistory: (sessionId: string) => Promise<Array<{ role: string; content: string }>>;
  saveMessage: (sessionId: string, role: string, content: string) => Promise<void>;
  calcAge: (birthDate: string) => number;
  getSidoName: (code: string) => string;
}) {
  // LangSmith에서 모델 호출이 gpt-4o / embedding 으로 구분되어 보임
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
  });

  // ── LangSmith traceable 파이프라인 함수 ────────────────────
  // LangSmith 대시보드에서 formatPrompt → invokeLLM → parseOutput 순서로 중첩 span 표시됨

  const formatPrompt = traceable(
    async (variables: Record<string, unknown>): Promise<BaseMessage[]> => {
      return RAG_PROMPT.formatMessages(variables as Parameters<(typeof RAG_PROMPT)['formatMessages']>[0]);
    },
    { name: 'formatPrompt' },
  );

  const invokeLLM = traceable(
    async (params: {
      messages: BaseMessage[];
      streamCallback: ((token: string) => void) | null;
      config?: RunnableConfig;
    }): Promise<string> => {
      const { messages, streamCallback, config: runConfig } = params;
      const chainConfig = { ...runConfig, runName: 'welfare-rag-generation' };

      if (streamCallback) {
        const stream = await llm.stream(messages, chainConfig);
        let accumulated = '';
        for await (const chunk of stream) {
          const token = typeof chunk.content === 'string' ? chunk.content : '';
          accumulated += token;
          streamCallback(token);
        }
        return accumulated;
      }

      const response = await llm.invoke(messages, chainConfig);
      return new StringOutputParser().invoke(response);
    },
    { run_type: 'llm', name: 'invokeLLM' },
  );

  const parseOutput = traceable(
    (rawResponse: string): string => rawResponse.trim(),
    { name: 'parseOutput' },
  );

  // ── 노드 1: 프로필 + 대화 히스토리 로드 ────────────────
  async function loadProfile(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const [profile, rawHistory] = await Promise.all([
      services.getProfile(state.userId),
      services.loadHistory(state.sessionId),
    ]);
    const chatHistory: BaseMessage[] = rawHistory.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );
    return { profile, chatHistory };
  }

  // ── 노드 2: Neo4j 온톨로지 추론 ────────────────────────
  // rag.service.ts 의 traceable 래퍼를 통해 Neo4j 쿼리가 LangSmith에 표시됨
  async function ontologyInfer(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    if (!state.profile) return { candidatePolicyIds: [] };
    const ids = await services.inferFromOntology(state.profile, state.question);
    return { candidatePolicyIds: ids };
  }

  // ── 노드 3: 벡터 검색 + 청약/주택 직접 조회 ───────────
  async function vectorRetrieve(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const sidoCode = state.profile?.sidoCode ?? '';
    const [vectorDocs, housingDocs] = await Promise.all([
      services.searchVectors(state.question, state.candidatePolicyIds),
      services.searchHousing(state.question, sidoCode),
    ]);
    return { documents: [...vectorDocs, ...housingDocs] };
  }

  // ── 노드 4: 문서 관련성 필터 + 중복 제거 ─────────────────
  async function gradeDocuments(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    // policyId 기준 중복 제거 (searchVectors + searchHousing 양쪽에서 동일 applyhome 데이터 올 수 있음)
    const seen = new Set<string>();
    const unique = state.documents.filter((doc) => {
      const key = (doc.metadata?.policyId as string) ?? doc.pageContent.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const filtered = unique.filter((doc) => (doc.metadata?.score ?? 0) >= 0.4);
    return {
      filteredDocuments: filtered.length > 0 ? filtered : unique.slice(0, 5),
    };
  }

  // ── 노드 4-2: Neo4j 그래프 인사이트 보강 ────────────────
  async function enrichWithGraph(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const policyIds = state.filteredDocuments
      .map((doc) => doc.metadata?.policyId as string)
      .filter(Boolean);
    const graphContext = await services.enrichWithGraph(policyIds);
    return { graphContext };
  }

  // ── 노드 5: LLM 답변 생성 ───────────────────────────────
  // LangSmith: runPipeline span 아래 formatPrompt → invokeLLM → parseOutput 중첩 표시
  async function generateAnswer(
    state: GraphStateType,
    config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const profile = state.profile;
    const context = state.filteredDocuments
      .map((doc, i) => `[정책 ${i + 1}]\n${doc.pageContent}`)
      .join('\n\n---\n\n');

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    const variables = {
      today: `${today} (현재 이 날짜 이후인 청약만 유효)`,
      age: profile?.birthDate ? services.calcAge(profile.birthDate) : '미입력',
      region: profile?.sidoCode ? services.getSidoName(profile.sidoCode) : '미입력',
      household: profile?.householdType ?? '미입력',
      occupation: profile?.occupationType ?? '미입력',
      income: profile?.incomeBracket ?? '미입력',
      housing: profile?.isHomeowner ? '자가' : '무주택/임차',
      context,
      graphContext: state.graphContext || '(그래프 인사이트 없음)',
      history: state.chatHistory ?? [],
      question: state.question,
    };

    const runPipeline = traceable(
      async () => {
        const messages = await formatPrompt(variables);
        const response = await invokeLLM({ messages, streamCallback: state.streamCallback, config });
        return parseOutput(response);
      },
      { name: 'runPipeline' },
    );

    const answer = await runPipeline();
    return { answer };
  }

  // ── 노드 6: 메시지 저장 ─────────────────────────────────
  async function saveMessage(state: GraphStateType): Promise<Partial<GraphStateType>> {
    if (state.sessionId && state.answer) {
      await services.saveMessage(state.sessionId, 'assistant', state.answer);
    }
    return {};
  }

  return new StateGraph(GraphState)
    .addNode('load_profile', loadProfile)
    .addNode('ontology_infer', ontologyInfer)
    .addNode('vector_retrieve', vectorRetrieve)
    .addNode('grade_documents', gradeDocuments)
    .addNode('enrich_graph', enrichWithGraph)
    .addNode('generate_answer', generateAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_profile')
    .addEdge('load_profile', 'ontology_infer')
    .addEdge('ontology_infer', 'vector_retrieve')
    .addEdge('vector_retrieve', 'grade_documents')
    .addEdge('grade_documents', 'enrich_graph')
    .addEdge('enrich_graph', 'generate_answer')
    .addEdge('generate_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
