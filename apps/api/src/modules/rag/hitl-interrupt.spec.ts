import { describe, expect, it, jest } from '@jest/globals';
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { createAwaitHitlNode, type HitlInterruptPayload } from './hitl-interrupt';
import type { PendingHitl } from './hitl-resume';
import type { HitlQuestionnaire } from './hitl.types';

/**
 * await_hitl 노드의 interrupt 중단-재개 계약 검증.
 *
 * 실제 4개 그래프와 같은 골격의 미니 그래프로:
 *   decide(재질문 판정) → await_hitl(interrupt) → decide(재개 후 스킵) → final
 * 를 돌려 (1) 중단 시 클래리피케이션 answer 유지, (2) Command({resume}) 재개 시
 * 보충 정보 병합·traceId 교체·상태 리셋, (3) ask-at-most-once를 확인한다.
 */

const CLARIFICATION_PROMPT = '지역과 나이를 알려주세요.';

const questionnaire: HitlQuestionnaire = {
  id: 'q-1',
  reason: 'missing_profile',
  detail: '프로필 미입력',
  questions: [],
};

const TestState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  question: Annotation<string>(),
  traceId: Annotation<string>(),
  answer: Annotation<string>(),
  skipSave: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  hitlResumed: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  hitlMeta: Annotation<Record<string, unknown> | null>({
    reducer: (_current, next) => next,
    default: () => null,
  }),
  pendingHitl: Annotation<HitlInterruptPayload | null>({
    reducer: (_current, next) => next,
    default: () => null,
  }),
});

type TestStateType = typeof TestState.State;

function buildTestGraph(emitThink = jest.fn()) {
  function decide(state: TestStateType): Partial<TestStateType> {
    if (state.hitlResumed) return {};
    const pending: PendingHitl = {
      originalQuestion: state.question,
      routeType: 'ELIGIBILITY',
      reason: 'missing_profile',
      source: 'request_missing_info',
      questionnaireId: questionnaire.id,
      threadId: state.traceId,
    };
    return {
      answer: CLARIFICATION_PROMPT,
      hitlMeta: { hitl: { ...pending } },
      pendingHitl: { questionnaire, pending },
    };
  }

  function routeAfterDecide(state: TestStateType): 'await_hitl' | 'final' {
    return state.pendingHitl ? 'await_hitl' : 'final';
  }

  function final(state: TestStateType): Partial<TestStateType> {
    return { answer: `FINAL:${state.question}` };
  }

  return new StateGraph(TestState)
    .addNode('decide', decide)
    .addNode('await_hitl', createAwaitHitlNode<TestStateType>({ emitThink }))
    .addNode('final', final)
    .addEdge(START, 'decide')
    .addConditionalEdges('decide', routeAfterDecide, {
      await_hitl: 'await_hitl',
      final: 'final',
    })
    .addEdge('await_hitl', 'decide')
    .addEdge('final', END)
    .compile({ checkpointer: new MemorySaver() });
}

const input = {
  question: '청년월세 받을 수 있어?',
  traceId: 'trace-1',
  messages: [],
  answer: '',
  hitlResumed: false,
};

const config = { configurable: { thread_id: 'trace-1' } };

describe('createAwaitHitlNode', () => {
  it('pendingHitl이 있으면 interrupt로 멈추고 클래리피케이션 answer를 유지한다', async () => {
    const graph = buildTestGraph();

    const result = await graph.invoke(input, config);
    expect(result.answer).toBe(CLARIFICATION_PROMPT);

    const snapshot = await graph.getState(config);
    const interrupts = snapshot.tasks.flatMap((task) => task.interrupts ?? []);
    expect(interrupts).toHaveLength(1);
    expect((interrupts[0].value as HitlInterruptPayload).pending.threadId).toBe('trace-1');
    // 아직 END에 도달하지 않았다.
    expect(snapshot.next.length).toBeGreaterThan(0);
  });

  it('Command({resume})로 재개하면 보충 정보를 병합하고 traceId를 교체한 뒤 끝까지 실행한다', async () => {
    const emitThink = jest.fn();
    const graph = buildTestGraph(emitThink);
    await graph.invoke(input, config);

    const result = await graph.invoke(
      new Command({ resume: { supplement: '서울, 만 27세', skipped: false, traceId: 'trace-2' } }),
      config,
    );

    expect(result.answer).toBe(`FINAL:${input.question}\n[사용자 보충 정보] 서울, 만 27세`);
    expect(result.hitlResumed).toBe(true);
    expect(result.traceId).toBe('trace-2');
    expect(result.pendingHitl).toBeNull();
    expect(result.hitlMeta).toBeNull();
    // 보충 정보가 대화 메시지로도 추가된다.
    const contents = result.messages.map((message: BaseMessage) => String(message.content));
    expect(contents).toContain('[사용자 보충 정보] 서울, 만 27세');
    // 재개 think 이벤트는 새 traceId로 나간다.
    expect(emitThink).toHaveBeenCalledWith('trace-2', expect.objectContaining({ node: 'await_hitl' }));
  });

  it('skip 재개는 원 질문 그대로 재질문 없이 끝까지 진행한다 (ask-at-most-once)', async () => {
    const graph = buildTestGraph();
    await graph.invoke(input, config);

    const result = await graph.invoke(
      new Command({ resume: { supplement: '', skipped: true } }),
      config,
    );

    expect(result.answer).toBe(`FINAL:${input.question}`);
    expect(result.hitlResumed).toBe(true);
    expect(result.traceId).toBe('trace-1');
  });
});
