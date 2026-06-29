import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Policy } from '../policies/entities/policy.entity';
import type {
  EligibilityRetrievalResult,
  RetrievalItem,
  RetrievalResult,
} from './retrieval.types';
import { dedupeItems, mapTraceKind } from './retrieval-helpers';
import { VectorRetrievalService } from './vector-retrieval.service';
import { PolicyGraphService } from './policy-graph.service';
import { HousingGraphService } from './housing-graph.service';
import { SuggestionService } from './suggestion.service';
import { QueryAnalysisService } from './query-analysis.service';

const GENERAL_WELFARE_RESULT_LIMIT = 8;
const LEXICAL_MATCH_SCORE = 0.9; // 정책명 정확 매치 — 약한 벡터 점수 위로 올린다.

@Injectable()
export class RetrieverServices {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
    private readonly vectorRetrieval: VectorRetrievalService,
    private readonly policyGraph: PolicyGraphService,
    private readonly housingGraph: HousingGraphService,
    private readonly suggestionService: SuggestionService,
    private readonly queryAnalysis: QueryAnalysisService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileType | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;
    return profile as unknown as UserProfileType;
  }

  async searchWelfare(question: string, userId: string, traceId?: string): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    const policyIds = profile ? await this.policyGraph.inferFromOntology(profile, traceId) : [];

    // 하이브리드: 벡터 검색(의미)과 렉시컬 검색(정책명 정확 매치)을 병합한다.
    // 짧은 키워드 쿼리("기초연금")는 임베딩 유사도가 낮아 벡터가 자기 문서를 놓치는데,
    // 렉시컬 arm이 Postgres name 매치로 정확히 끌어와 recall을 보강한다.
    const [vectorResult, lexicalItems] = await Promise.all([
      this.vectorRetrieval.searchGeneralWelfare(question, policyIds, traceId),
      this.lookupNamedPrograms(question),
    ]);

    const items = dedupeItems([...lexicalItems, ...vectorResult.items]).slice(
      0,
      GENERAL_WELFARE_RESULT_LIMIT,
    );

    const graphSummary =
      policyIds.length > 0
        ? await this.policyGraph.enrichWithGraphData(policyIds.slice(0, 10), traceId)
        : '';

    return {
      ...vectorResult,
      items,
      summary:
        items.length > 0
          ? `일반 복지 정책 후보 ${items.length}건을 찾았습니다.`
          : '관련 복지 정책을 찾지 못했습니다.',
      graphSummary,
    };
  }

  // 질문이 지목한 정책명을 Postgres에서 정확 매치로 찾아 RetrievalItem으로 변환한다.
  // 지목된 정책명이 없으면 빈 배열(벡터 단독).
  private async lookupNamedPrograms(question: string): Promise<RetrievalItem[]> {
    const programs = this.queryAnalysis.extractNamedPrograms(question);
    if (programs.length === 0) return [];

    const rows = await this.policyRepo
      .createQueryBuilder('p')
      .where(
        new Brackets((qb) => {
          programs.forEach((program, index) => {
            qb.orWhere(`p.name ILIKE :prog${index}`, { [`prog${index}`]: `%${program}%` });
          });
        }),
      )
      .andWhere('p.status = :status', { status: 'ACTIVE' })
      .andWhere('p.source IN (:...sources)', { sources: ['bokjiro', 'local_bokjiro'] })
      .orderBy('p.syncedAt', 'DESC')
      .limit(5)
      .getMany();

    return rows.map((policy) => this.toLexicalItem(policy));
  }

  private toLexicalItem(policy: Policy): RetrievalItem {
    const id = policy.externalId ?? policy.id;
    const content =
      policy.content ||
      [
        `[정책명] ${policy.name}`,
        policy.provider ? `[주관부처] ${policy.provider}` : '',
        policy.summary ? `[개요] ${policy.summary}` : '',
        policy.applyUrl ? `[신청링크] ${policy.applyUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    return {
      id,
      title: policy.name,
      source: policy.source,
      kind: mapTraceKind(policy.source),
      score: LEXICAL_MATCH_SCORE,
      content,
      metadata: {
        policyId: id,
        source: policy.source,
        applyUrl: policy.applyUrl ?? null,
        lexical: true,
      },
    };
  }

  searchYouthPolicies(question: string, traceId?: string) {
    return this.vectorRetrieval.searchYouthPolicies(question, traceId);
  }

  async searchPolicyEligibility(
    policyName: string,
    userId: string,
    traceId?: string,
  ): Promise<EligibilityRetrievalResult> {
    const profile = await this.getProfile(userId);
    return this.vectorRetrieval.searchPolicyEligibility(policyName, profile, traceId);
  }

  async searchHousingSubscriptions(
    question: string,
    userId: string,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    const sidoCode = profile?.sidoCode ?? '';
    const [graphItems, vectorItems] = await Promise.all([
      this.housingGraph.fetchHousingAnnouncements(sidoCode, traceId),
      this.vectorRetrieval.searchHousingAnnouncementVectors(question, traceId),
    ]);

    const items = dedupeItems([...graphItems, ...vectorItems]).slice(0, 12);
    return {
      source: 'search_housing_subscription',
      query: question,
      summary:
        items.length > 0
          ? `청약·분양 관련 자료 ${items.length}건을 찾았습니다.`
          : '관련 청약·분양 자료를 찾지 못했습니다.',
      items,
    };
  }

  async searchRentalSupport(
    question: string,
    userId: string,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    const sidoCode = profile?.sidoCode ?? '';
    const [graphItems, vectorItems] = await Promise.all([
      this.housingGraph.fetchHousingComplexes(sidoCode, traceId),
      this.vectorRetrieval.searchRentalSupportVectors(question, traceId),
    ]);

    const items = dedupeItems([...graphItems, ...vectorItems]).slice(0, 10);
    return {
      source: 'search_rental_support',
      query: question,
      summary:
        items.length > 0
          ? `주거 지원 관련 자료 ${items.length}건을 찾았습니다.`
          : '관련 주거 지원 자료를 찾지 못했습니다.',
      items,
    };
  }

  async searchWelfareFacilities(
    question: string,
    facilityType: string,
    userId: string,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    return this.vectorRetrieval.searchWelfareFacilities(
      question,
      facilityType,
      profile?.sidoCode ?? null,
      traceId,
    );
  }

  async getUpcomingDeadlines(
    userId: string,
    daysAhead: number,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    const items = await this.housingGraph.fetchUpcomingDeadlines(
      profile?.sidoCode ?? '',
      daysAhead,
      traceId,
    );

    return {
      source: 'get_upcoming_deadlines',
      query: `daysAhead:${daysAhead}`,
      summary:
        items.length > 0
          ? `현재 접수 중이거나 곧 마감되는 공고 ${items.length}건을 찾았습니다.`
          : '현재 접수 중인 공고를 찾지 못했습니다.',
      items,
    };
  }

  async getSuggestions(userId: string): Promise<string[]> {
    const profile = await this.getProfile(userId);
    return this.suggestionService.getSuggestions(profile);
  }
}
