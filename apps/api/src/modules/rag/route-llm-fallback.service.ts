import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { RouteFallbackClassifier, RouteFallbackResult } from './route-fallback';
import { ROUTER_FALLBACK_SYSTEM_PROMPT } from './prompts';

const ROUTE_SCHEMA = z.object({
  route: z.enum(['SEARCH', 'ELIGIBILITY', 'APPLICATION_ASSIST']),
  reason: z.string().describe('선택 근거 한 문장 (한국어)'),
});

// 라우팅은 스트리밍 시작 전에 실행되므로 TTFB에 직접 더해진다. 이 시간을 넘기면
// 분류를 포기하고 정규식 기본값(SEARCH)으로 진행한다.
const FALLBACK_TIMEOUT_MS = Number(process.env.RAG_ROUTE_FALLBACK_TIMEOUT_MS ?? 2500);

@Injectable()
export class RouteLlmFallbackService implements RouteFallbackClassifier {
  private readonly logger = new Logger(RouteLlmFallbackService.name);
  private readonly classifier;

  constructor() {
    const llm = new ChatOpenAI({
      model: process.env.OPENAI_ROUTER_MODEL ?? 'gpt-5-nano',
      maxRetries: 1,
    });
    this.classifier = llm.withStructuredOutput(ROUTE_SCHEMA, { name: 'route_decision' });
  }

  async classify(question: string): Promise<RouteFallbackResult | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), FALLBACK_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        this.classifier.invoke([
          new SystemMessage(ROUTER_FALLBACK_SYSTEM_PROMPT),
          new HumanMessage(question),
        ]),
        timeout,
      ]);

      if (!result) {
        this.logger.warn(`라우팅 폴백 시간 초과(${FALLBACK_TIMEOUT_MS}ms) — 기본 라우팅 유지`);
        return null;
      }

      return { routeType: result.route, reason: result.reason };
    } catch (error) {
      this.logger.warn(`라우팅 폴백 실패 — 기본 라우팅 유지: ${(error as Error).message}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
