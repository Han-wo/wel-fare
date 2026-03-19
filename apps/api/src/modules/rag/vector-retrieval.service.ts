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
  dedupeItems,
  extractPolicyIdFromPayload,
  extractTraceLabel,
  mapTraceKind,
  toRetrievalItem,
} from './retrieval-helpers';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { formatEligibilityProfile } from './retrieval-helpers';

@Injectable()
export class VectorRetrievalService {
  private readonly logger = new Logger(VectorRetrievalService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;

  constructor(
    private readonly traceFacade: TraceFacade,
    private readonly config: ConfigService,
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
    const queryVector = await this.embeddings.embedQuery(question);
    const filter =
      policyIds.length > 0
        ? { must: [{ key: 'policyId', match: { any: policyIds } }] }
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
      items: searchResult.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index)),
    };
  }

  async searchYouthPolicies(question: string, traceId?: string): Promise<RetrievalResult> {
    const queryVector = await this.embeddings.embedQuery(question);
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
      items: searchResult.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index)),
    };
  }

  async searchPolicyEligibility(
    policyName: string,
    profile: UserProfileType | null,
    traceId?: string,
  ): Promise<EligibilityRetrievalResult> {
    const queryVector = await this.embeddings.embedQuery(policyName);
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
      items: searchResult.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index)),
    };
  }

  async searchHousingAnnouncementVectors(question: string, traceId?: string) {
    const queryVector = await this.embeddings.embedQuery(question);
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

    return qdrantRes.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index));
  }

  async searchRentalSupportVectors(question: string, traceId?: string) {
    try {
      const queryVector = await this.embeddings.embedQuery(question);
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
      return merged.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index));
    } catch (error) {
      this.logger.error('임대지원 Qdrant 조회 오류:', error);
      return [];
    }
  }

  async searchWelfareFacilities(
    question: string,
    facilityType: string,
    regionCode: string | null,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const query = facilityType ? `${facilityType} ${question}` : question;
    const queryVector = await this.embeddings.embedQuery(query);
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
      items: searchResult.map((result, index) => toRetrievalItem(result.payload ?? {}, result.score, index)),
    };
  }

  async searchSuggestionNames(profileText: string) {
    const queryVector = await this.embeddings.embedQuery(profileText);
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
