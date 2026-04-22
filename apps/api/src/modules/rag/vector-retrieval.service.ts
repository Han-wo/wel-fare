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
        const filter =
          normalizedPolicyIds.length > 0
            ? { must: [{ key: 'policyId', match: { any: normalizedPolicyIds } }] }
            : {
                should: [
                  { key: 'source', match: { value: 'bokjiro' } },
                  { key: 'source', match: { value: 'local_bokjiro' } },
                ],
              };

        const searchResult = await this.qdrantClient.search(this.collectionName, {
          vector: queryVector,
          limit: 8,
          filter,
          with_payload: true,
          score_threshold: 0.4,
        });

        this.traceVectorSearch(traceId, 'Qdrant 일반 복지 검색', question, searchResult, filter);

        return {
          source: 'search_welfare',
          query: question,
          summary:
            searchResult.length > 0
              ? `일반 복지 정책 후보 ${searchResult.length}건을 찾았습니다.`
              : '관련 복지 정책을 찾지 못했습니다.',
          items: searchResult.map((result, index) =>
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
