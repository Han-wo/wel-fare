import { describe, expect, it } from '@jest/globals';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
  countToolCallRounds,
  hasCalledTool,
  isToolBudgetExhausted,
  MAX_TOOL_ROUNDS,
} from './tool-budget';

const toolCallMessage = (name: string) =>
  new AIMessage({ content: '', tool_calls: [{ id: `call_${name}`, name, args: {} }] });

describe('tool-budget', () => {
  it('counts only AI messages that carry tool calls', () => {
    const messages = [
      new HumanMessage('청년 정책 알려줘'),
      toolCallMessage('search_youth_policy'),
      new ToolMessage({ content: '{}', tool_call_id: 'call_search_youth_policy' }),
      new AIMessage('답변 텍스트'),
    ];

    expect(countToolCallRounds(messages)).toBe(1);
  });

  it('counts a multi-tool round as one round', () => {
    const multi = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'a', name: 'search_welfare', args: {} },
        { id: 'b', name: 'search_youth_policy', args: {} },
      ],
    });

    expect(countToolCallRounds([multi])).toBe(1);
  });

  it('is not exhausted below the cap', () => {
    const messages = Array.from({ length: MAX_TOOL_ROUNDS - 1 }, (_, i) =>
      toolCallMessage(`tool_${i}`),
    );

    expect(isToolBudgetExhausted(messages)).toBe(false);
  });

  it('is exhausted at the cap', () => {
    const messages = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) =>
      toolCallMessage(`tool_${i}`),
    );

    expect(isToolBudgetExhausted(messages)).toBe(true);
  });

  it('respects a custom cap', () => {
    expect(isToolBudgetExhausted([toolCallMessage('x')], 1)).toBe(true);
    expect(isToolBudgetExhausted([toolCallMessage('x')], 2)).toBe(false);
  });

  it('hasCalledTool은 특정 도구 호출 여부를 판별한다', () => {
    const messages = [
      new HumanMessage('질문'),
      toolCallMessage('search_youth_policy'),
      new ToolMessage({ content: '{}', tool_call_id: 'call_search_youth_policy' }),
    ];

    expect(hasCalledTool(messages, 'search_youth_policy')).toBe(true);
    expect(hasCalledTool(messages, 'search_welfare')).toBe(false);
  });
});
