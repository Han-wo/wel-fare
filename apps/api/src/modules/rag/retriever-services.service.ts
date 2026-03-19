import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { UserProfile } from '../profile/entities/user-profile.entity';
import type {
  EligibilityRetrievalResult,
  RetrievalResult,
} from './retrieval.types';
import { dedupeItems } from './retrieval-helpers';
import { VectorRetrievalService } from './vector-retrieval.service';
import { PolicyGraphService } from './policy-graph.service';
import { HousingGraphService } from './housing-graph.service';
import { SuggestionService } from './suggestion.service';

@Injectable()
export class RetrieverServices {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    private readonly vectorRetrieval: VectorRetrievalService,
    private readonly policyGraph: PolicyGraphService,
    private readonly housingGraph: HousingGraphService,
    private readonly suggestionService: SuggestionService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileType | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;
    return profile as unknown as UserProfileType;
  }

  async searchWelfare(question: string, userId: string, traceId?: string): Promise<RetrievalResult> {
    const profile = await this.getProfile(userId);
    const policyIds = profile ? await this.policyGraph.inferFromOntology(profile, traceId) : [];
    const vectorResult = await this.vectorRetrieval.searchGeneralWelfare(question, policyIds, traceId);
    const graphSummary =
      policyIds.length > 0
        ? await this.policyGraph.enrichWithGraphData(policyIds.slice(0, 10), traceId)
        : '';

    return {
      ...vectorResult,
      graphSummary,
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
