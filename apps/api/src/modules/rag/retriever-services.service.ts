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
import { TraceFacade } from './trace-facade.service';
import { calcAge } from '@welfare-ai/shared-utils';
import {
  assessAge,
  formatAgeVerdictLine,
  normalizeAgeBound,
  type AgeRequirement,
} from './age-eligibility';
import { ProfileFactsService } from '../profile/profile-facts.service';
import type { ProfileWithFacts } from './profile-facts';

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
    private readonly traceFacade: TraceFacade,
    private readonly profileFacts: ProfileFactsService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileType | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;

    // 대화(HITL)에서 확인된 사실을 얹는다. 정형 프로필이 비어 있어도 이전
    // 세션에서 답한 지역/나이대 등으로 재질문을 피하고 컨텍스트를 보강한다.
    const facts = await this.profileFacts.getFacts(userId).catch(() => ({}));
    if (Object.keys(facts).length > 0) {
      (profile as unknown as ProfileWithFacts).hitlFacts = facts;
    }

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
      // 벡터 arm(searchGeneralWelfare의 sourceFilter)과 같은 코퍼스를 봐야 한다.
      // static_doc·gov24가 빠져 있으면 "문화비 소득공제"처럼 NAMED_PROGRAMS에는
      // 있는데 bokjiro에 없는 제도는 렉시컬 보강을 전혀 못 받는다 — 벡터가 놓치면
      // assessNamedProgramCoverage가 "엔티티 부재"로 보고 HITL 재질문으로 샌다.
      .andWhere('p.source IN (:...sources)', {
        sources: ['bokjiro', 'local_bokjiro', 'gov24', 'static_doc'],
      })
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

  /**
   * 청년정책 검색 + 연령 조건 결정적 판정.
   *
   * 시더가 넣어둔 구조화 조건(reqType:'AGE', minValue/maxValue)을 읽어
   * 프로필 나이와 대조한 뒤, 판정 결과를 근거 본문에 한 줄로 덧붙인다.
   * 확정적으로 답할 수 있는 축을 LLM 추측에 맡기지 않는 것이 목적이다.
   *
   * 결과를 걸러내지는 않는다 — 나이가 안 맞아도 "왜 안 되는지"를 사유와 함께
   * 답하는 편이 목록에서 조용히 사라지는 것보다 낫고, 사용자가 가족 등
   * 본인 아닌 사람을 물어보는 경우도 있다.
   */
  async searchYouthPolicies(
    question: string,
    userId: string,
    traceId?: string,
  ): Promise<RetrievalResult> {
    const [result, profile] = await Promise.all([
      this.vectorRetrieval.searchYouthPolicies(question, traceId),
      this.getProfile(userId),
    ]);

    if (result.items.length === 0) return result;

    const requirements = await this.loadAgeRequirements(result.items);
    if (requirements.size === 0) return result;

    const age = profile?.birthDate ? calcAge(profile.birthDate) : null;

    // 나이를 모르는데 연령 조건이 걸린 정책이 있으면, 그 사실을 요약에 실어
    // LLM이 "나이를 물어볼지"를 근거에 기반해 정하게 한다. 질문에 '청년'이라는
    // 단어가 있는지(getClarificationRequest의 정규식)가 아니라, 검색된 정책이
    // 실제로 연령을 요구하는지가 판단 근거가 되어야 한다.
    if (age === null) {
      if (traceId) {
        this.traceFacade.addEvent(traceId, {
          type: 'decision',
          title: '연령 조건 판정 보류',
          detail: `연령 조건이 있는 정책 ${requirements.size}건을 찾았으나 생년월일이 없어 판정을 보류했습니다.`,
          payload: { reason: 'age_unknown', pending: requirements.size },
        });
      }
      return {
        ...result,
        summary:
          `${result.summary} 이 중 ${requirements.size}건은 연령 조건이 있는데 ` +
          '사용자 생년월일이 없어 해당 여부를 확정하지 못했습니다 — 나이를 확인해 안내하세요.',
      };
    }

    let mismatches = 0;
    const items = result.items.map((item) => {
      const assessment = assessAge(age, requirements.get(item.id) ?? null);
      const line = formatAgeVerdictLine(assessment);
      if (!line) return item;
      if (assessment.verdict === 'MISMATCH') mismatches += 1;

      return {
        ...item,
        content: `${item.content}\n${line}`,
        metadata: { ...item.metadata, ageVerdict: assessment.verdict },
      };
    });

    if (traceId) {
      this.traceFacade.addEvent(traceId, {
        type: 'decision',
        title: '연령 조건 결정적 판정',
        detail: `만 ${age}세 기준으로 청년정책 ${requirements.size}건의 연령 조건을 평가해 ${mismatches}건이 미해당입니다.`,
        payload: { age, evaluated: requirements.size, mismatches },
      });
    }

    return { ...result, items };
  }

  /**
   * 검색된 문서의 연령 조건을 Postgres에서 한 번에 읽어온다.
   *
   * 구조화 조건은 Qdrant payload가 아니라 policy_requirements에 있다.
   * Qdrant는 policyId를 `youth_<plcyNo>`로, Postgres는 externalId를
   * `youth_center:<plcyNo>`로 쓰므로 접두어를 맞춰 조인한다.
   */
  private async loadAgeRequirements(
    items: RetrievalItem[],
  ): Promise<Map<string, AgeRequirement>> {
    const byExternalId = new Map<string, string>();
    for (const item of items) {
      if (item.source !== 'youth_center') continue;
      byExternalId.set(`youth_center:${item.id.replace(/^youth_/, '')}`, item.id);
    }
    if (byExternalId.size === 0) return new Map();

    const rows = await this.policyRepo
      .createQueryBuilder('p')
      .innerJoin('p.requirements', 'r')
      .select([
        'p.externalId AS "externalId"',
        'r.minValue AS "minValue"',
        'r.maxValue AS "maxValue"',
        'r.description AS "description"',
      ])
      .where('p.externalId IN (:...ids)', { ids: [...byExternalId.keys()] })
      .andWhere('r.reqType = :reqType', { reqType: 'AGE' })
      .getRawMany<{
        externalId: string;
        minValue: string | null;
        maxValue: string | null;
        description: string | null;
      }>();

    const result = new Map<string, AgeRequirement>();
    for (const row of rows) {
      const itemId = byExternalId.get(row.externalId);
      if (!itemId) continue;
      // numeric 컬럼은 드라이버가 문자열로 돌려준다.
      result.set(itemId, {
        // 원천의 0(= 제한 없음)을 도메인 경계로 정규화한다.
        minValue: normalizeAgeBound(row.minValue === null ? null : Number(row.minValue)),
        maxValue: normalizeAgeBound(row.maxValue === null ? null : Number(row.maxValue)),
        description: row.description,
      });
    }
    return result;
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
