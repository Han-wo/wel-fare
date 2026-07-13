import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { QUESTION_CONDENSER_SYSTEM_PROMPT } from './prompts';
import { isLikelyFollowUp } from './follow-up-detection';

const CONDENSE_SCHEMA = z.object({
  standalone: z.string().describe('대화 맥락 없이도 이해되는 독립형 질문 (한국어 한 문장)'),
  changed: z.boolean().describe('원 질문을 실제로 재작성했으면 true, 이미 독립형이면 false'),
});

// 재작성은 라우팅·검색보다 앞서 실행되어 TTFB에 직접 더해진다. 시간을 넘기면
// 재작성을 포기하고 원 질문 그대로 진행한다 (기존 동작 대비 후퇴 없음).
// 후속 질문으로 감지된 턴에만 발생하는 비용이라 라우팅 폴백보다 여유를 둔다.
const CONDENSE_TIMEOUT_MS = Number(process.env.RAG_CONDENSE_TIMEOUT_MS ?? 4000);

const HISTORY_TAKE = 6;
const HISTORY_SNIPPET_LENGTH = 400;

export interface HistoryMessage {
  role: string;
  content: string;
}

@Injectable()
export class QuestionCondenserService {
  private readonly logger = new Logger(QuestionCondenserService.name);
  private readonly condenser;

  constructor() {
    // 지시어 치환은 reasoning이 필요 없는 작업이라 비-reasoning 모델을 쓴다.
    // gpt-5-nano는 reasoning 토큰 때문에 5초 이상 걸려 타임아웃에 걸린다(실측).
    const llm = new ChatOpenAI({
      model: process.env.RAG_CONDENSE_MODEL ?? 'gpt-4o-mini',
      maxRetries: 1,
    });
    this.condenser = llm.withStructuredOutput(CONDENSE_SCHEMA, { name: 'condensed_question' });
  }

  /**
   * 후속 질문이면 독립형으로 재작성해 돌려준다.
   * 재작성이 불필요하거나 실패·시간 초과면 null (호출부는 원 질문 유지).
   */
  async condense(question: string, history: HistoryMessage[]): Promise<string | null> {
    if (!isLikelyFollowUp(question, history.length > 0)) return null;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CONDENSE_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        this.condenser.invoke([
          new SystemMessage(QUESTION_CONDENSER_SYSTEM_PROMPT),
          new HumanMessage(this.buildUserPrompt(question, history)),
        ]),
        timeout,
      ]);

      if (!result) {
        this.logger.warn(`질문 재작성 시간 초과(${CONDENSE_TIMEOUT_MS}ms) — 원 질문 유지`);
        return null;
      }

      const standalone = result.standalone.trim();
      if (!result.changed || !standalone || standalone === question.trim()) return null;
      return standalone;
    } catch (error) {
      this.logger.warn(`질문 재작성 실패 — 원 질문 유지: ${(error as Error).message}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private buildUserPrompt(question: string, history: HistoryMessage[]): string {
    const recent = history
      .slice(-HISTORY_TAKE)
      .map((message) => {
        const role = message.role === 'user' ? '사용자' : '상담사';
        return `${role}: ${message.content.slice(0, HISTORY_SNIPPET_LENGTH)}`;
      })
      .join('\n');
    return `[이전 대화]\n${recent}\n\n[마지막 질문]\n${question}`;
  }
}
