import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { RerankerService, type RerankCandidate } from './reranker.service';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

const CANDIDATES: RerankCandidate[] = [
  { key: 'a', title: '청년월세 지원', content: '월세 20만원 지원' },
  { key: 'b', title: '기초연금', content: '만 65세 이상 지원' },
  { key: 'c', title: '행복주택', content: '청년 임대주택 공고' },
];

function makeService(scorerResult: () => Promise<unknown>): RerankerService {
  const service = new RerankerService(
    makeConfig({ OPENAI_API_KEY: 'test-key' }),
  );
  (service as unknown as { scorer: { invoke: () => Promise<unknown> } }).scorer = {
    invoke: scorerResult,
  };
  return service;
}

describe('RerankerService', () => {
  it('OPENAI_API_KEY가 없으면 비활성 — null 반환', async () => {
    const service = new RerankerService(makeConfig({}));
    expect(await service.rerank('청년월세', CANDIDATES)).toBeNull();
  });

  it('RAG_RERANK_ENABLED=off면 null 반환', async () => {
    const service = new RerankerService(
      makeConfig({ OPENAI_API_KEY: 'test-key', RAG_RERANK_ENABLED: 'off' }),
    );
    expect(await service.rerank('청년월세', CANDIDATES)).toBeNull();
  });

  it('후보가 없으면 null 반환', async () => {
    const service = makeService(async () => ({ scores: [] }));
    expect(await service.rerank('청년월세', [])).toBeNull();
  });

  it('정상 응답이면 key→score 맵을 만들고 범위를 [0,1]로 자른다', async () => {
    const service = makeService(async () => ({
      scores: [
        { index: 0, score: 0.9 },
        { index: 1, score: -0.2 },
        { index: 2, score: 1.7 },
      ],
    }));
    const scores = await service.rerank('청년월세', CANDIDATES);
    expect(scores).not.toBeNull();
    expect(scores!.get('a')).toBe(0.9);
    expect(scores!.get('b')).toBe(0);
    expect(scores!.get('c')).toBe(1);
  });

  it('절반 넘게 누락된 응답은 버린다 (융합 순위 유지)', async () => {
    const service = makeService(async () => ({
      scores: [{ index: 0, score: 0.9 }],
    }));
    expect(await service.rerank('청년월세', CANDIDATES)).toBeNull();
  });

  it('존재하지 않는 index는 무시한다', async () => {
    const service = makeService(async () => ({
      scores: [
        { index: 0, score: 0.8 },
        { index: 1, score: 0.5 },
        { index: 99, score: 0.4 },
      ],
    }));
    const scores = await service.rerank('청년월세', CANDIDATES);
    expect(scores!.size).toBe(2);
  });

  it('scorer가 던지면 null 반환 (기존 순위 유지)', async () => {
    const service = makeService(async () => {
      throw new Error('rate limit');
    });
    expect(await service.rerank('청년월세', CANDIDATES)).toBeNull();
  });
});
