import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { VectorRetrievalService } from './vector-retrieval.service';
import type { RerankerService } from './reranker.service';

/**
 * hybridSearch/rerankHits의 폴백 사다리 검증.
 * Qdrant·임베딩·리랭커를 전부 페이크로 갈아끼우고 분기만 확인한다.
 */

type AnyRecord = Record<string, unknown>;

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

const fakeTraceFacade = {
  addEvent: () => undefined,
  recordVectorSearch: () => undefined,
} as AnyRecord;

// 캐시는 항상 miss로 두고 loader를 곧장 실행한다.
const fakeRagCache = {
  getOrLoad: async (params: { loader: () => Promise<unknown> }) => ({
    value: await params.loader(),
    hit: false,
  }),
} as AnyRecord;

type TrackedFn = ReturnType<typeof jest.fn>;

function makeService(options: {
  hybrid?: 'on' | 'off';
  rerankResult?: Map<string, number> | null;
  queryImpl?: TrackedFn;
  searchImpl?: TrackedFn;
}) {
  const reranker = {
    rerank: jest.fn(async () => options.rerankResult ?? null),
  };
  const service = new VectorRetrievalService(
    fakeTraceFacade as never,
    makeConfig({
      RAG_HYBRID_SEARCH: options.hybrid ?? 'on',
      OPENAI_API_KEY: 'test-key',
    }),
    fakeRagCache as never,
    reranker as unknown as RerankerService,
  );

  const search =
    options.searchImpl ??
    jest.fn(async () => [{ id: 'dense-1', score: 0.8, payload: {} }]);
  const query =
    options.queryImpl ??
    jest.fn(async () => ({
      points: [
        { id: 'fused-1', score: 0.9, payload: {} },
        { id: 'fused-2', score: 0.6, payload: {} },
      ],
    }));

  (service as unknown as AnyRecord).qdrantClient = { search, query };
  (service as unknown as AnyRecord).embeddings = {
    embedQuery: async () => [0.1, 0.2, 0.3],
  };

  return { service, search, query, reranker };
}

type HybridParams = {
  text: string;
  namespace: string;
  limit: number;
};

function callHybrid(service: VectorRetrievalService, params: HybridParams) {
  return (
    service as unknown as {
      hybridSearch: (p: HybridParams) => Promise<Array<{ id?: string | number }>>;
    }
  ).hybridSearch(params);
}

describe('hybridSearch 폴백 사다리', () => {
  it('하이브리드 on이면 query API(RRF)를 쓴다', async () => {
    const { service, search, query } = makeService({});
    const hits = await callHybrid(service, {
      text: '청년도약계좌',
      namespace: 'test',
      limit: 5,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(hits.map((h) => h.id)).toEqual(['fused-1', 'fused-2']);
  });

  it('RAG_HYBRID_SEARCH=off면 dense 단독 검색만 쓴다', async () => {
    const { service, search, query } = makeService({ hybrid: 'off' });
    await callHybrid(service, { text: '청년도약계좌', namespace: 'test', limit: 5 });
    expect(query).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('sparse 인코딩이 불가한 텍스트는 dense 단독으로 진행한다', async () => {
    const { service, search, query } = makeService({});
    await callHybrid(service, { text: '!!!', namespace: 'test', limit: 5 });
    expect(query).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('query API가 실패하면 dense 단독으로 폴백한다', async () => {
    const failingQuery = jest.fn(async () => {
      throw new Error('collection has no sparse vector');
    });
    const { service, search } = makeService({ queryImpl: failingQuery });
    const hits = await callHybrid(service, {
      text: '청년도약계좌',
      namespace: 'test',
      limit: 5,
    });
    expect(failingQuery).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(hits.map((h) => h.id)).toEqual(['dense-1']);
  });
});

describe('rerankHits', () => {
  const hits = [
    { id: 'a', score: 0.9, payload: { policyName: 'A', content: 'a' } },
    { id: 'b', score: 0.8, payload: { policyName: 'B', content: 'b' } },
    { id: 'c', score: 0.7, payload: { policyName: 'C', content: 'c' } },
  ];

  function callRerank(
    service: VectorRetrievalService,
    finalLimit: number,
  ): Promise<Array<{ id?: string | number; score?: number | null }>> {
    return (
      service as unknown as {
        rerankHits: (
          q: string,
          h: typeof hits,
          l: number,
        ) => Promise<Array<{ id?: string | number; score?: number | null }>>;
      }
    ).rerankHits('질문', hits, finalLimit);
  }

  it('리랭크 성공 시 보정 점수로 재정렬하고 누락 문서는 중립 점수를 받는다', async () => {
    const { service } = makeService({
      rerankResult: new Map([
        ['a', 0.2],
        ['c', 0.95],
      ]),
    });
    const result = await callRerank(service, 3);
    expect(result.map((h) => h.id)).toEqual(['c', 'b', 'a']);
    expect(result[0].score).toBe(0.95);
    expect(result[1].score).toBe(0.25); // RERANK_MISSING_SCORE
  });

  it('리랭크 실패(null) 시 기존 순위 그대로 자른다', async () => {
    const { service } = makeService({ rerankResult: null });
    const result = await callRerank(service, 2);
    expect(result.map((h) => h.id)).toEqual(['a', 'b']);
    expect(result[0].score).toBe(0.9);
  });
});
