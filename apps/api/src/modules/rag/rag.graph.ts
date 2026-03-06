import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { UserProfile } from '@welfare-ai/shared-types';

const GraphState = Annotation.Root({
  question: Annotation<string>(),
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  profile: Annotation<UserProfile | null>(),
  candidatePolicyIds: Annotation<string[]>(),
  documents: Annotation<Document[]>(),
  filteredDocuments: Annotation<Document[]>(),
  answer: Annotation<string>(),
  streamCallback: Annotation<((token: string) => void) | null>(),
});

type GraphStateType = typeof GraphState.State;

const RAG_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `당신은 대한민국 정부 및 지자체의 복지·지원금 정책을 안내하는 전문 AI 컨설턴트입니다.

사용자 정보:
- 나이: {age}세 / 거주지: {region} / 가구형태: {household}
- 직업: {occupation} / 소득: 중위소득 {income}% 이하 / 주거: {housing}

관련 정책 정보:
{context}

규칙:
1. 위 정책 정보에 있는 내용만 기반으로 답변합니다
2. 각 정책명, 지원금액, 신청 방법을 명확히 안내합니다
3. 신청 기간이 있는 경우 반드시 언급합니다
4. 사용자 조건에 맞지 않는 정책은 제외합니다
5. 한국어로 친절하게 답변합니다`,
  ],
  ['human', '{question}'],
]);

export function createRagGraph(services: {
  getProfile: (userId: string) => Promise<UserProfile | null>;
  inferFromOntology: (profile: UserProfile, question: string) => Promise<string[]>;
  searchVectors: (question: string, policyIds: string[]) => Promise<Document[]>;
  saveMessage: (sessionId: string, role: string, content: string) => Promise<void>;
  calcAge: (birthDate: string) => number;
  getSidoName: (code: string) => string;
}) {
  // LangSmith에서 모델 호출이 gpt-4o / embedding 으로 구분되어 보임
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o',
    streaming: true,
    temperature: 0.2,
  });

  // ── 노드 1: 프로필 로드 ─────────────────────────────────
  // LangSmith에서 "load_profile" 이름으로 span 생성됨
  async function loadProfile(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const profile = await services.getProfile(state.userId);
    return { profile };
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

  // ── 노드 3: 벡터 검색 ──────────────────────────────────
  async function vectorRetrieve(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const docs = await services.searchVectors(state.question, state.candidatePolicyIds);
    return { documents: docs };
  }

  // ── 노드 4: 문서 관련성 필터 ────────────────────────────
  async function gradeDocuments(
    state: GraphStateType,
    _config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const filtered = state.documents.filter((doc) => (doc.metadata?.score ?? 0) >= 0.65);
    return {
      filteredDocuments: filtered.length > 0 ? filtered : state.documents.slice(0, 5),
    };
  }

  // ── 노드 5: LLM 답변 생성 ───────────────────────────────
  // LangSmith에서 prompt → llm → parser 체인이 중첩 span으로 표시됨
  async function generateAnswer(
    state: GraphStateType,
    config?: RunnableConfig,
  ): Promise<Partial<GraphStateType>> {
    const profile = state.profile;
    const context = state.filteredDocuments
      .map((doc, i) => `[정책 ${i + 1}]\n${doc.pageContent}`)
      .join('\n\n---\n\n');

    // runName을 지정하면 LangSmith 대시보드에서 식별이 쉬움
    const chain = RAG_PROMPT.pipe(llm).pipe(new StringOutputParser());

    const variables = {
      age: profile?.birthDate ? services.calcAge(profile.birthDate) : '미입력',
      region: profile?.sidoCode ? services.getSidoName(profile.sidoCode) : '미입력',
      household: profile?.householdType ?? '미입력',
      occupation: profile?.occupationType ?? '미입력',
      income: profile?.incomeBracket ?? '미입력',
      housing: profile?.isHomeowner ? '자가' : '무주택/임차',
      context,
      question: state.question,
    };

    // config를 체인에 전달하면 LangSmith 트레이스가 부모 run에 연결됨
    const chainConfig = { ...config, runName: 'welfare-rag-generation' };

    let answer = '';
    if (state.streamCallback) {
      const stream = await chain.stream(variables, chainConfig);
      for await (const token of stream) {
        answer += token;
        state.streamCallback(token);
      }
    } else {
      answer = await chain.invoke(variables, chainConfig);
    }

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
    .addNode('generate_answer', generateAnswer)
    .addNode('save_message', saveMessage)
    .addEdge(START, 'load_profile')
    .addEdge('load_profile', 'ontology_infer')
    .addEdge('ontology_infer', 'vector_retrieve')
    .addEdge('vector_retrieve', 'grade_documents')
    .addEdge('grade_documents', 'generate_answer')
    .addEdge('generate_answer', 'save_message')
    .addEdge('save_message', END)
    .compile();
}
