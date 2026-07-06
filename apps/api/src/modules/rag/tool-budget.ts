import type { AIMessage, BaseMessage } from '@langchain/core/messages';

/**
 * ReAct 툴 루프의 명시적 예산.
 *
 * shouldContinue는 마지막 메시지에 tool_calls가 있으면 무조건 tools로 보내므로,
 * 상한이 없으면 LangGraph 기본 recursionLimit(25)까지 LLM 왕복이 가능하다.
 * 예산 소진 시 agent 노드가 도구 없는 LLM으로 전환해 "지금까지 수집한 근거로
 * 최종 답변"을 강제한다. pre_route가 만든 고정 tool call도 1라운드로 센다.
 */
export const MAX_TOOL_ROUNDS = 4;

// AIMessageChunk는 AIMessage의 instanceof로 잡히지 않으므로 tool_calls 존재로 판별한다.
export function countToolCallRounds(messages: BaseMessage[]): number {
  return messages.filter((message) => {
    const toolCalls = (message as AIMessage).tool_calls;
    return Array.isArray(toolCalls) && toolCalls.length > 0;
  }).length;
}

export function isToolBudgetExhausted(
  messages: BaseMessage[],
  maxRounds: number = MAX_TOOL_ROUNDS,
): boolean {
  return countToolCallRounds(messages) >= maxRounds;
}

// 이번 턴에서 특정 도구가 이미 호출됐는지. 검색 재시도(retry_search)가
// 같은 도구를 무의미하게 반복하지 않도록 게이트한다.
export function hasCalledTool(messages: BaseMessage[], toolName: string): boolean {
  return messages.some((message) => {
    const toolCalls = (message as AIMessage).tool_calls;
    return Array.isArray(toolCalls) && toolCalls.some((call) => call.name === toolName);
  });
}
