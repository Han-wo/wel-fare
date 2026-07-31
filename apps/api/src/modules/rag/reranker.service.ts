import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { RERANKER_SYSTEM_PROMPT } from './prompts';

const RERANK_SCHEMA = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().int().describe('문서 index (입력 순서 그대로)'),
        score: z.number().min(0).max(1).describe('질문 관련성 0.0~1.0'),
      }),
    )
    .describe('모든 문서의 점수'),
});

// 리랭킹은 검색 도구 안에서 실행되어 답변 TTFB에 더해진다. 시간을 넘기면
// 리랭킹을 포기하고 융합(RRF) 순위 그대로 진행한다 (기존 동작 대비 후퇴 없음).
const RERANK_TIMEOUT_MS = Number(process.env.RAG_RERANK_TIMEOUT_MS ?? 3500);
const SNIPPET_LENGTH = 300;

export interface RerankCandidate {
  /** 후보 식별자 — 호출부의 Qdrant point id 문자열. */
  key: string;
  title: string | null;
  content: string | null;
}

@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly scorer: {
    invoke: (input: (SystemMessage | HumanMessage)[]) => Promise<z.infer<typeof RERANK_SCHEMA>>;
  } | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.enabled = config.get('RAG_RERANK_ENABLED', 'on') !== 'off' && Boolean(apiKey);

    // 키가 없으면 LLM을 만들지 않는다 — ChatOpenAI 생성자가 키 부재로 던져서
    // 모듈 부트스트랩(단위 테스트 포함)이 깨지는 것을 막는다.
    if (!this.enabled) {
      this.scorer = null;
      return;
    }

    // 채점은 reasoning이 필요 없는 작업이라 비-reasoning 소형 모델을 쓴다
    // (question-condenser와 같은 이유 — nano는 reasoning 토큰 지연이 큼).
    const llm = new ChatOpenAI({
      model: config.get('RAG_RERANK_MODEL', 'gpt-4o-mini'),
      maxRetries: 1,
      apiKey,
    });
    this.scorer = llm.withStructuredOutput(RERANK_SCHEMA, { name: 'rerank_scores' });
  }

  /**
   * 질문-문서 관련성을 0~1로 재채점한다.
   * 비활성·실패·시간 초과면 null (호출부는 기존 순위 유지).
   */
  async rerank(
    question: string,
    candidates: RerankCandidate[],
  ): Promise<Map<string, number> | null> {
    const scorer = this.scorer;
    if (!this.enabled || !scorer || candidates.length === 0) return null;

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), RERANK_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        scorer.invoke([
          new SystemMessage(RERANKER_SYSTEM_PROMPT),
          new HumanMessage(this.buildUserPrompt(question, candidates)),
        ]),
        timeout,
      ]);

      if (!result) {
        this.logger.warn(`리랭킹 시간 초과(${RERANK_TIMEOUT_MS}ms) — 융합 순위 유지`);
        return null;
      }

      const scores = new Map<string, number>();
      for (const entry of result.scores) {
        const candidate = candidates[entry.index];
        if (!candidate) continue;
        scores.set(candidate.key, Math.min(1, Math.max(0, entry.score)));
      }

      // 절반 넘게 빠뜨린 응답은 신뢰하지 않는다 — 부분 점수로 정렬하면
      // 누락 문서가 일괄 하위로 밀려 융합 순위보다 나빠질 수 있다.
      if (scores.size < Math.ceil(candidates.length / 2)) {
        this.logger.warn(
          `리랭킹 응답 불충분(${scores.size}/${candidates.length}) — 융합 순위 유지`,
        );
        return null;
      }

      return scores;
    } catch (error) {
      this.logger.warn(`리랭킹 실패 — 융합 순위 유지: ${(error as Error).message}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private buildUserPrompt(question: string, candidates: RerankCandidate[]): string {
    const docs = candidates
      .map((candidate, index) => {
        const title = candidate.title ?? '(제목 없음)';
        const snippet = (candidate.content ?? '').slice(0, SNIPPET_LENGTH);
        return `[${index}] ${title}\n${snippet}`;
      })
      .join('\n\n');
    return `[질문]\n${question}\n\n[문서 목록]\n${docs}`;
  }
}
