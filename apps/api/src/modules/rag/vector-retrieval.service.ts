import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { TraceFacade } from './trace-facade.service';
import type {
  EligibilityRetrievalResult,
  RetrievalResult,
} from './retrieval.types';
import {
  buildProfileCacheFingerprint,
  dedupeItems,
  extractPolicyIdFromPayload,
  extractTraceLabel,
  formatEligibilityProfile,
  mapTraceKind,
  normalizeCacheText,
  toRetrievalItem,
} from './retrieval-helpers';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { RagCacheService } from './rag-cache.service';

const EMBEDDING_CACHE_TTL_SECONDS = 60 * 60 * 24;
const RETRIEVAL_CACHE_TTL_SECONDS = 60 * 10;
const FAST_MOVING_CACHE_TTL_SECONDS = 60 * 5;

// 일반 복지 검색: 프로필 온톨로지를 하드 필터(must)로 쓰면 프로필과 안 맞는
// 특정 정책(예: 36세 유저의 "기초연금")이 코퍼스에 있어도 후보군에서 원천 배제된다.
// 그래서 (1) source 전체 의미검색으로 recall을 확보하고, (2) 온톨로지 후보는
// 같은 쿼리 벡터로 랭킹해 부스트로 합친다(union + boost). 최종 적합 판단은 LLM이
// 프로필 컨텍스트로 수행한다.
const GENERAL_WELFARE_SEMANTIC_LIMIT = 10;
const GENERAL_WELFARE_ONTOLOGY_LIMIT = 8;
const GENERAL_WELFARE_RESULT_LIMIT = 8;
const GENERAL_WELFARE_SEMANTIC_THRESHOLD = 0.4;
const GENERAL_WELFARE_ONTOLOGY_BOOST = 0.15;

type QdrantHit = {
  id?: string | number;
  score?: number | null;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class VectorRetrievalService {
  private readonly logger = new Logger(VectorRetrievalService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;

  constructor(
    private readonly traceFacade: TraceFacade,
    private readonly config: ConfigService,
    private readonly ragCache: RagCacheService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      model: this.config.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
      openAIApiKey: this.config.get('OPENAI_API_KEY'),
    });

    this.qdrantClient = new QdrantClient({
      url: this.config.get('QDRANT_URL', 'http://localhost:6333'),
      apiKey: this.config.get('QDRANT_API_KEY'),
    });

    this.collectionName = this.config.get('QDRANT_COLLECTION', 'welfare_policies');
  }

  async searchGeneralWelfare(
    question: string,
    policyIds: string[],
    traceId?: string,
  ): Promise<RetrievalResult> {
    const normalizedQuestion = normalizeCacheText(question);
    const normalizedPolicyIds = [...new Set(policyIds)].sort();
    const { value, hit } = await this.ragCache.getOrLoad<RetrievalResult>({
      namespace: 'vector:general-welfare',
      keyParts: [normalizedQuestion, normalizedPolicyIds],
      ttlSeconds: RETRIEVAL_CACHE_TTL_SECONDS,
      dataVersionScope: 'welfare',
      loader: async () => {
        const queryVector = await this.embedQueryCached(normalizedQuestion, 'general-welfare');

        const sourceFilter = {
          should: [
            { key: 'source', match: { value: 'bokjiro' } },
            { key: 'source', match: { value: 'local_bokjiro' } },
          ],
        };

        // (1) recall: 프로필과 무관하게 질문에 직접 부합하는 정책을 코퍼스 전체에서.
        // (2) personalization: 온톨로지 후보를 같은 쿼리 벡터로 랭킹(하드 임계값 없음).
        const [semanticHits, ontologyHits] = await Promise.all([
          this.qdrantClient.search(this.collectionName, {
            vector: queryVector,
            limit: GENERAL_WELFARE_SEMANTIC_LIMIT,
            filter: sourceFilter,
            with_payload: true,
            score_threshold: GENERAL_WELFARE_SEMANTIC_THRESHOLD,
          }),
          normalizedPolicyIds.length > 0
            ? this.qdrantClient.search(this.collectionName, {
                vector: queryVector,
                limit: GENERAL_WELFARE_ONTOLOGY_LIMIT,
                filter: { must: [{ key: 'policyId', match: { any: normalizedPolicyIds } }] },
                with_payload: true,
              })
            : Promise.resolve([] as QdrantHit[]),
        ]);

        const merged = this.mergeWithOntologyBoost(semanticHits, ontologyHits);

        this.traceVectorSearch(traceId, 'Qdrant 일반 복지 검색', question, merged, {
          mode: 'union+boost',
          semanticHits: semanticHits.length,
          ontologyCandidates: normalizedPolicyIds.length,
          ontologyHits: ontologyHits.length,
        });

        return {
          source: 'search_welfare',
          query: question,
          summary:
            merged.length > 0
              ? `일반 복지 정책 후보 ${merged.length}건을 찾았습니다.`
              : '관련 복지 정책을 찾지 못했습니다.',
          items: merged.map((result, index) =>
            toRetrievalItem(result.payload ?? {}, result.score, index),
          ),
        };
      },
    });

    this.traceCacheDecision(traceId, '일반 복지 벡터 검색', hit, 'vector:general-welfare');
    return value;
  }

  async searchYouthPolicies(question: string, traceId?: string): Promise<RetrievalResult> {
    const normalizedQuestion = normalizeCacheText(question);
    const { value, hit } = await this.ragCache.getOrLoad<RetrievalResult>({
      namespace: 'vector:youth-policy',
      keyParts: [normalizedQuestion],
      ttlSeconds: RETRIEVAL_CACHE_TTL_SECONDS,
      dataVersionScope: 'youth',
      loader: async () => {
        const queryVector = await this.embedQueryCached(normalizedQuestion, 'youth-policy');
        const searchResult = await this.qdrantClient.search(this.collectionName, {
          vector: queryVector,
          limit: 6,
          filter: { must: [{ key: 'source', match: { value: 'youth_center' } }] },
          with_payload: true,
          score_threshold: 0.35,
        });

        this.traceVectorSearch(traceId, 'Qdrant 청년정책 검색', question, searchResult, {
          must: [{ key: 'source', match: { value: 'youth_center' } }],
        });

        return {
          source: 'search_youth_policy',
          query: question,
          summary:
            searchResult.length > 0
              ? `청년정책 후보 ${searchResult.length}건을 찾았습니다.`
              : '관련 청년정책을 찾지 못했습니다.',
          items: searchResult.map((result, index) =>
            toRetrievalItem(result.payload ?? {}, result.score, index),
          ),
        };
      },
    });

    this.traceCacheDecision(traceId, '청년정책 벡터 검색', hit, 'vector:youth-policy');
    return value;
  }

  async searchPolicyEligibility(
    policyName: string,
    profile: UserProfileType | null,
    traceId?: string,
  ): Promise<EligibilityRetrievalResult> {
    const normalizedPolicyName = normalizeCacheText(policyName);
    const { value, hit } = await this.ragCache.getOrLoad<EligibilityRetrievalResult>({
      namespace: 'vector:policy-eligibility',
      keyParts: [normalizedPolicyName, buildProfileCacheFingerprint(profile)],
      ttlSeconds: RETRIEVAL_CACHE_TTL_SECONDS,
      dataVersionScope: 'policy',
      loader: async () => {
        const queryVector = await this.embedQueryCached(
          normalizedPolicyName,
          'policy-eligibility',
        );
        const searchResult = await this.qdrantClient.search(this.collectionName, {
          vector: queryVector,
          limit: 3,
          with_payload: true,
          score_threshold: 0.5,
        });

        this.traceVectorSearch(traceId, '정책명 기반 적격성 검색', policyName, searchResult);

        return {
          source: 'check_policy_eligibility',
          query: policyName,
          summary:
            searchResult.length > 0
              ? `적격성 판단용 정책 후보 ${searchResult.length}건을 찾았습니다.`
              : '해당 정책 자료를 찾지 못했습니다.',
          profileSummary: profile ? formatEligibilityProfile(profile) : '프로필 미설정',
          items: searchResult.map((result, index) =>
            toRetrievalItem(result.payload ?? {}, result.score, index),
          ),
        };
      },
    });

    this.traceCacheDecision(traceId, '적격성 벡터 검색', hit, 'vector:policy-eligibility');
    return value;
  }

  async searchHousingAnnouncementVectors(question: string, traceId?: string) {
    const normalizedQuestion = normalizeCacheText(question);
    const { value, hit } = await this.ragCache.getOrLoad<ReturnType<typeof toRetrievalItem>[]>({
      namespace: 'vector:housing-announcements',
      keyParts: [normalizedQuestion],
      ttlSeconds: FAST_MOVING_CACHE_TTL_SECONDS,
      dataVersionScope: 'housing_subscription',
      loader: async () => {
        const queryVector = await this.embedQueryCached(
          normalizedQuestion,
          'housing-announcements',
        );
        const qdrantRes = await this.qdrantClient.search(this.collectionName, {
          vector: queryVector,
          limit: 6,
          filter: {
            should: [
              { key: 'source', match: { value: 'applyhome' } },
              { key: 'source', match: { value: 'myhome_announcement' } },
              { key: 'source', match: { value: 'applyhome_cmpet' } },
              { key: 'source', match: { value: 'applyhome_stat' } },
            ],
          },
          with_payload: true,
          score_threshold: 0.35,
        });

        this.traceVectorSearch(traceId, 'Qdrant 청약 공고 검색', question, qdrantRes, {
          should: [
            { key: 'source', match: { value: 'applyhome' } },
            { key: 'source', match: { value: 'myhome_announcement' } },
            { key: 'source', match: { value: 'applyhome_cmpet' } },
            { key: 'source', match: { value: 'applyhome_stat' } },
          ],
        });

        return qdrantRes.map((result, index) =>
          toRetrievalItem(result.payload ?? {}, result.score, index),
        );
      },
    });

    this.traceCacheDecision(traceId, '청약 공고 벡터 검색', hit, 'vector:housing-announcements');
    return value;
  }

  async searchRentalSupportVectors(question: string, traceId?: string) {
    const normalizedQuestion = normalizeCacheText(question);
    const { value, hit } = await this.ragCache.getOrLoad<ReturnType<typeof toRetrievalItem>[]>({
      namespace: 'vector:rental-support',
      keyParts: [normalizedQuestion],
      ttlSeconds: FAST_MOVING_CACHE_TTL_SECONDS,
      dataVersionScope: 'rental_support',
      loader: async () => {
        try {
          const queryVector = await this.embedQueryCached(
            normalizedQuestion,
            'rental-support',
          );
          const [lhResults, bokjiroResults] = await Promise.all([
            this.qdrantClient.search(this.collectionName, {
              vector: queryVector,
              limit: 5,
              filter: { must: [{ key: 'source', match: { value: 'lh_housing' } }] },
              with_payload: true,
              score_threshold: 0.35,
            }),
            this.qdrantClient.search(this.collectionName, {
              vector: queryVector,
              limit: 4,
              filter: { must: [{ key: 'source', match: { value: 'bokjiro' } }] },
              with_payload: true,
              score_threshold: 0.4,
            }),
          ]);

          const merged = [...lhResults, ...bokjiroResults];
          this.traceVectorSearch(traceId, 'Qdrant 주거 지원 검색', question, merged, {
            sources: ['lh_housing', 'bokjiro'],
          });
          return merged.map((result, index) =>
            toRetrievalItem(result.payload ?? {}, result.score, index),
          );
        } catch (error) {
          this.logger.error('임대지원 Qdrant 조회 오류:', error);
          return [];
        }
      },
    });

    this.traceCacheDecision(traceId, '주거 지원 벡터 검색', hit, 'vector:rental-support');
    return value;
  }

  async searchWelfareFacilities(
    question: string,
    facilityType: string,
    regionCode: string | null,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const query = facilityType ? `${facilityType} ${question}` : question;
    const normalizedQuery = normalizeCacheText(query);
    const { value, hit } = await this.ragCache.getOrLoad<RetrievalResult>({
      namespace: 'vector:welfare-facility',
      keyParts: [normalizedQuery, facilityType, regionCode ?? ''],
      ttlSeconds: RETRIEVAL_CACHE_TTL_SECONDS,
      dataVersionScope: 'facility',
      loader: async () => {
        const queryVector = await this.embedQueryCached(
          normalizedQuery,
          'welfare-facility',
        );
        const searchResult = await this.qdrantClient.search(this.collectionName, {
          vector: queryVector,
          limit: 8,
          filter: { must: [{ key: 'source', match: { value: 'welfare_facility' } }] },
          with_payload: true,
          score_threshold: 0.35,
        });

        this.traceVectorSearch(traceId, 'Qdrant 복지시설 검색', query, searchResult, {
          must: [{ key: 'source', match: { value: 'welfare_facility' } }],
          region: regionCode,
        });

        return {
          source: 'search_welfare_facility',
          query,
          summary:
            searchResult.length > 0
              ? `복지시설 후보 ${searchResult.length}건을 찾았습니다.`
              : '관련 복지시설을 찾지 못했습니다.',
          items: searchResult.map((result, index) =>
            toRetrievalItem(result.payload ?? {}, result.score, index),
          ),
        };
      },
    });

    this.traceCacheDecision(traceId, '복지시설 벡터 검색', hit, 'vector:welfare-facility');
    return value;
  }

  async searchSuggestionNames(profileText: string) {
    const normalizedProfileText = normalizeCacheText(profileText);
    const { value } = await this.ragCache.getOrLoad<string[]>({
      namespace: 'vector:suggestion-names',
      keyParts: [normalizedProfileText],
      ttlSeconds: RETRIEVAL_CACHE_TTL_SECONDS,
      dataVersionScope: 'all',
      loader: async () => {
        const queryVector = await this.embedQueryCached(
          normalizedProfileText,
          'suggestion-names',
        );
        const qdrantResults = await this.qdrantClient
          .search(this.collectionName, {
            vector: queryVector,
            limit: 8,
            with_payload: true,
            score_threshold: 0.45,
          })
          .catch(() => []);

        return qdrantResults
          .map((result) => {
            const payload = (result.payload ?? {}) as Record<string, unknown>;
            const content = ((payload.content ?? payload.text) as string) ?? '';
            return {
              name: extractTraceLabel(payload, 0),
              content,
            };
          })
          .map(({ content }) => {
            const extracted = content.match(/\[(?:정책명|서비스명|시설명|단지명|공고명)\]\s*(.+)/)?.[1];
            return extracted ? extracted.trim().split('\n')[0].trim() : null;
          })
          .filter((name): name is string => Boolean(name && name.length < 35));
      },
    });

    return value;
  }

  // 의미검색 결과와 온톨로지 후보를 합치고, 온톨로지에 속한 정책은 점수를
  // 부스트해 상위로 끌어올린다. 점수(score)는 원래 코사인 유사도를 그대로 보존하고
  // 정렬만 부스트된 순위(rank)로 한다.
  private mergeWithOntologyBoost(semanticHits: QdrantHit[], ontologyHits: QdrantHit[]): QdrantHit[] {
    const ontologyIds = new Set(ontologyHits.map((h) => String(h.id)));
    const byKey = new Map<string, { hit: QdrantHit; rank: number }>();

    const consider = (hit: QdrantHit) => {
      const key = String(hit.id);
      const base = hit.score ?? 0;
      const rank = base + (ontologyIds.has(key) ? GENERAL_WELFARE_ONTOLOGY_BOOST : 0);
      const prev = byKey.get(key);
      if (!prev || rank > prev.rank) {
        byKey.set(key, { hit, rank });
      }
    };

    semanticHits.forEach(consider);
    ontologyHits.forEach(consider);

    return [...byKey.values()]
      .sort((a, b) => b.rank - a.rank)
      .slice(0, GENERAL_WELFARE_RESULT_LIMIT)
      .map((entry) => entry.hit);
  }

  private async embedQueryCached(question: string, namespace: string) {
    const model = this.config.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    const { value } = await this.ragCache.getOrLoad<number[]>({
      namespace: `embedding:${namespace}`,
      keyParts: [model, question],
      ttlSeconds: EMBEDDING_CACHE_TTL_SECONDS,
      loader: () => this.embeddings.embedQuery(question),
    });

    return value;
  }

  private traceCacheDecision(
    traceId: string | undefined,
    title: string,
    hit: boolean,
    namespace: string,
  ) {
    if (!traceId) return;

    this.traceFacade.addEvent(traceId, {
      type: 'decision',
      title: `${title} ${hit ? 'cache hit' : 'cache miss'}`,
      detail: hit
        ? 'Redis 캐시된 retrieval 결과를 사용했습니다.'
        : 'Redis 캐시 미스로 원본 retrieval을 실행했습니다.',
      payload: {
        cache: 'redis',
        namespace,
      },
    });
  }

  private traceVectorSearch(
    traceId: string | undefined,
    title: string,
    query: string,
    results: Array<{ id?: string | number; score?: number | null; payload?: Record<string, unknown> | null }>,
    filter?: unknown,
  ) {
    if (!traceId) return;

    this.traceFacade.recordVectorSearch(traceId, {
      title,
      query,
      filter,
      hits: results.map((result, index) => {
        const payload = result.payload ?? {};
        const source = typeof payload.source === 'string' ? payload.source : null;
        const policyId = extractPolicyIdFromPayload(payload, index);
        return {
          id: `entity:${policyId}`,
          label: extractTraceLabel(payload, index),
          kind: mapTraceKind(source),
          score: result.score ?? null,
          source,
          meta: {
            policyId,
            source,
            qdrantId: result.id ?? null,
          },
        };
      }),
    });
  }
}
