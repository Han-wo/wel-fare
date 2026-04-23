import { Injectable, Logger } from '@nestjs/common';
import { ChatRuntimeService } from '../chat/chat-runtime.service';
import type { RagThinkPayload } from './thinking.types';
import type { HitlQuestionnaire } from './hitl.types';

export type RagStreamEvent =
  | { type: 'session_created'; data: string }
  | { type: 'think'; data: '' }
  | { type: 'think_detail'; data: RagThinkPayload }
  | { type: 'text'; data: string }
  | { type: 'hitl'; data: HitlQuestionnaire }
  | { type: 'done'; data: '' };

type StreamExecutorResult = {
  answer: string;
};

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(private readonly chatRuntime: ChatRuntimeService) {}

  async *stream(
    sessionId: string,
    handlers: {
      onStart?: () => Promise<void> | void;
      run: (input: {
        pushText: (text: string) => Promise<void>;
        pushThink: (payload: RagThinkPayload) => Promise<void>;
        pushHitl: (payload: HitlQuestionnaire) => Promise<void>;
        isClosed: () => Promise<boolean>;
      }) => Promise<StreamExecutorResult>;
      onSuccess: (result: StreamExecutorResult) => Promise<void>;
      onError: (error: Error) => Promise<void>;
      onAbort: () => Promise<void>;
    },
  ): AsyncGenerator<RagStreamEvent> {
    try {
      await Promise.resolve(handlers.onStart?.());
    } catch (error) {
      await handlers.onError(error as Error);
      yield { type: 'text', data: `\n\n⚠️ 오류가 발생했습니다: ${(error as Error).message}` };
      yield { type: 'done', data: '' };
      return;
    }

    await this.chatRuntime.openSession(sessionId);
    const streamToken = await this.chatRuntime.startStream(sessionId);
    const events: RagStreamEvent[] = [
      { type: 'session_created', data: sessionId },
      { type: 'think', data: '' },
    ];

    let done = false;
    let emittedText = false;
    let aborted = false;

    const pushText = async (text: string) => {
      if (await this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        return;
      }

      emittedText = true;
      events.push({ type: 'text', data: text });
      this.chatRuntime.notifyActivity(sessionId, streamToken);
    };

    const pushThink = async (payload: RagThinkPayload) => {
      if (await this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        return;
      }

      events.push({ type: 'think_detail', data: payload });
      this.chatRuntime.notifyActivity(sessionId, streamToken);
    };

    const pushHitl = async (payload: HitlQuestionnaire) => {
      this.logger.log(
        `[HITL] push 시도 sessionId=${sessionId} id=${payload.id} reason=${payload.reason} questions=${payload.questions.length}`,
      );
      if (await this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        this.logger.warn(`[HITL] 스트림 종료로 drop sessionId=${sessionId}`);
        return;
      }

      events.push({ type: 'hitl', data: payload });
      this.chatRuntime.notifyActivity(sessionId, streamToken);
    };

    void Promise.resolve()
      .then(() =>
        handlers.run({
          pushText,
          pushThink,
          pushHitl,
          isClosed: () => this.chatRuntime.isStreamClosed(sessionId, streamToken),
        }),
      )
      .then(async (result) => {
        if (aborted) {
          return;
        }
        if (
          result.answer &&
          !emittedText &&
          !(await this.chatRuntime.isStreamClosed(sessionId, streamToken))
        ) {
          events.push({ type: 'text', data: result.answer });
        }
        await handlers.onSuccess(result);
        done = true;
        events.push({ type: 'done', data: '' });
        this.chatRuntime.notifyActivity(sessionId, streamToken);
      })
      .catch(async (error) => {
        if (aborted) {
          return;
        }
        this.logger.error('스트리밍 실행 오류', error);
        await handlers.onError(error as Error);
        events.push({ type: 'text', data: `\n\n⚠️ 오류가 발생했습니다: ${(error as Error).message}` });
        done = true;
        events.push({ type: 'done', data: '' });
        this.chatRuntime.notifyActivity(sessionId, streamToken);
      });

    try {
      while (
        (!done || events.length > 0) &&
        !(await this.chatRuntime.isStreamClosed(sessionId, streamToken))
      ) {
        if (events.length > 0) {
          yield events.shift()!;
          continue;
        }

        await this.chatRuntime.waitForWake(sessionId, streamToken);
      }

      if (!done && (await this.chatRuntime.isStreamClosed(sessionId, streamToken))) {
        aborted = true;
        done = true;
        await handlers.onAbort();
        yield { type: 'done', data: '' };
      }
    } finally {
      await this.chatRuntime.finishStream(sessionId, streamToken);
    }
  }
}
