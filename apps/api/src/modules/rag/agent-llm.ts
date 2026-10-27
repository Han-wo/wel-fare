import { ChatOpenAI } from '@langchain/openai';

/**
 * 그래프용 ChatOpenAI 팩토리.
 *
 * 배경: 기본 모델(gpt-5-mini)은 reasoning 모델이라 첫 토큰까지 오래 걸린다.
 * 같은 프롬프트로 실측한 답변 생성 TTFB —
 *   기본 9.45s / effort 'low' 2.10s / effort 'minimal' 1.00s
 * 파이프라인 전체 TTFB가 35초였고 그 대부분이 답변 노드의 reasoning이었다.
 *
 * 이 코드베이스는 이미 같은 판단을 내린 적이 있다(reranker·question-condenser가
 * "reasoning이 필요 없는 작업"이라 비-reasoning 모델을 쓴다). 답변 노드만 예외로
 * 남아 있던 것을 맞춘다.
 *
 * 두 등급으로 나눈다:
 *  - agent: 도구 선택 + ReAct 루프의 답변. 도구 선택 판단이 섞여 있어 'low'.
 *  - answer: 이미 모인 근거를 형식에 맞춰 옮겨 쓰는 일뿐이라 'minimal'.
 * 둘 다 환경변수로 덮어쓸 수 있다(모델을 비-reasoning으로 바꾸면 무시된다).
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

const VALID_EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

function resolveEffort(raw: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  const value = raw?.trim() as ReasoningEffort | undefined;
  return value && VALID_EFFORTS.includes(value) ? value : fallback;
}

function create(effort: ReasoningEffort) {
  return new ChatOpenAI({
    model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5-mini',
    streaming: true,
    // 비-reasoning 모델에서는 서버가 무시한다.
    reasoningEffort: effort,
  } as ConstructorParameters<typeof ChatOpenAI>[0]);
}

/** 도구를 바인딩해 쓰는 ReAct 에이전트용. */
export function createAgentLlm() {
  return create(resolveEffort(process.env.RAG_AGENT_REASONING_EFFORT, 'low'));
}

/** 도구 없이 근거를 답변으로 옮겨 쓰는 용도(예산 소진 답변·정정 부록). */
export function createAnswerLlm() {
  return create(resolveEffort(process.env.RAG_ANSWER_REASONING_EFFORT, 'minimal'));
}
