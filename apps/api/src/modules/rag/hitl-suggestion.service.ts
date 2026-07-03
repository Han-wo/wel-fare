import { Inject, Injectable, Logger } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import type { UserProfile } from '@welfare-ai/shared-types';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import { NEO4J_DRIVER } from './rag.tokens';
import { VectorRetrievalService } from './vector-retrieval.service';
import {
  ageToLifeStage,
  profileToTargetGroups,
  buildProfileText,
} from './retrieval-helpers';
import type {
  HitlChoice,
  HitlQuestion,
  HitlQuestionnaire,
  HitlReason,
} from './hitl.types';
import type { RetrievalItem, RetrievalResult } from './retrieval.types';

const HITL_CHOICE_LIMIT = 5;

type MissingField = 'policy_name' | 'region' | 'age' | 'income' | 'housing';

const INCOME_CHOICES: HitlChoice[] = [
  { id: '50', label: '중위소득 50% 이하', description: '기초생활수급자 수준' },
  { id: '75', label: '중위소득 75% 이하', description: '차상위계층 범위' },
  { id: '100', label: '중위소득 100% 이하' },
  { id: '150', label: '중위소득 150% 이하' },
  { id: '200', label: '중위소득 초과' },
];

const HOUSING_CHOICES: HitlChoice[] = [
  { id: 'NONE', label: '무주택' },
  { id: 'RENT_MONTHLY', label: '월세 거주' },
  { id: 'RENT_JEONSE', label: '전세 거주' },
  { id: 'OWNED', label: '자가' },
];

const AGE_CHOICES: HitlChoice[] = [
  { id: '10s', label: '10대 (청소년)' },
  { id: '20s', label: '20대' },
  { id: '30s', label: '30대' },
  { id: '40-50s', label: '40~50대' },
  { id: '65+', label: '만 65세 이상' },
];

@Injectable()
export class HitlSuggestionService {
  private readonly logger = new Logger(HitlSuggestionService.name);

  constructor(
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    private readonly vectorRetrieval: VectorRetrievalService,
  ) {}

  async buildMissingFieldQuestionnaire(input: {
    missingFields: MissingField[];
    question: string;
    profile: UserProfile | null;
  }): Promise<HitlQuestionnaire> {
    const questions = await Promise.all(
      input.missingFields.map((field) =>
        this.buildMissingFieldQuestion(field, input.question, input.profile),
      ),
    );

    return {
      id: this.generateId('missing'),
      reason: 'missing_profile',
      detail: '질문을 정확히 좁히기 위해 몇 가지 정보를 선택해주세요.',
      questions: questions.filter((q): q is HitlQuestion => q !== null),
    };
  }

  async buildRecoveryQuestionnaire(input: {
    question: string;
    profile: UserProfile | null;
    retrieval: RetrievalResult | null;
  }): Promise<HitlQuestionnaire> {
    const reason: HitlReason =
      !input.retrieval || input.retrieval.items.length === 0
        ? 'empty_retrieval'
        : 'low_relevance';

    const question = await this.buildCategoryQuestion(
      input.question,
      input.profile,
      input.retrieval,
    );

    return {
      id: this.generateId('recovery'),
      reason,
      detail:
        reason === 'empty_retrieval'
          ? '검색 결과가 비어 있어 어떤 방향을 원하시는지 확인이 필요합니다.'
          : '검색 결과의 관련도가 낮아 방향을 다시 확인하고 싶습니다.',
      questions: [question],
    };
  }

  private async buildMissingFieldQuestion(
    field: MissingField,
    question: string,
    profile: UserProfile | null,
  ): Promise<HitlQuestion | null> {
    switch (field) {
      case 'region':
        return this.buildRegionQuestion(profile);
      case 'policy_name':
        return this.buildPolicyNameQuestion(question, profile);
      case 'age':
        return this.buildSimpleQuestion(
          'age',
          'age',
          '나이대를 알려주세요',
          AGE_CHOICES,
        );
      case 'income':
        return this.buildSimpleQuestion(
          'income',
          'income',
          '소득 수준을 선택해주세요',
          INCOME_CHOICES,
        );
      case 'housing':
        return this.buildSimpleQuestion(
          'housing',
          'housing',
          '현재 주거 형태를 선택해주세요',
          HOUSING_CHOICES,
        );
      default:
        return null;
    }
  }

  private buildSimpleQuestion(
    id: string,
    fieldKey: string,
    prompt: string,
    choices: HitlChoice[],
  ): HitlQuestion {
    return {
      id,
      fieldKey,
      prompt,
      choices,
      allowCustom: true,
      allowSkip: true,
    };
  }

  private async buildRegionQuestion(profile: UserProfile | null): Promise<HitlQuestion> {
    const sidoChoices = await this.loadPopularRegions(profile);

    return {
      id: 'region',
      fieldKey: 'region',
      prompt: profile?.sidoCode
        ? `${getSidoName(profile.sidoCode)} 안에서 어느 지역을 기준으로 볼까요?`
        : '어느 지역 기준으로 알아볼까요?',
      choices: sidoChoices,
      allowCustom: true,
      allowSkip: true,
    };
  }

  private async buildPolicyNameQuestion(
    question: string,
    profile: UserProfile | null,
  ): Promise<HitlQuestion> {
    const [graphNames, vectorNames] = await Promise.all([
      this.loadPolicyNameCandidatesFromGraph(profile),
      this.loadPolicyNameCandidatesFromVector(question, profile),
    ]);

    const merged = dedupeStrings([...graphNames, ...vectorNames]).slice(0, HITL_CHOICE_LIMIT);
    const choices: HitlChoice[] = merged.map((name) => ({
      id: name,
      label: name,
    }));

    return {
      id: 'policy_name',
      fieldKey: 'policy_name',
      prompt: '어떤 정책·공고를 말씀하시는 건가요?',
      choices,
      allowCustom: true,
      allowSkip: true,
    };
  }

  private async buildCategoryQuestion(
    question: string,
    profile: UserProfile | null,
    retrieval: RetrievalResult | null,
  ): Promise<HitlQuestion> {
    const [themeChoices, vectorThemeChoices] = await Promise.all([
      this.loadThemeChoicesFromGraph(profile),
      this.loadThemeChoicesFromRetrieval(retrieval, question, profile),
    ]);

    const merged = dedupeChoices([...vectorThemeChoices, ...themeChoices]).slice(0, HITL_CHOICE_LIMIT);

    return {
      id: 'category',
      fieldKey: 'category',
      prompt: '혹시 이 중 찾으시는 분야가 있을까요?',
      choices: merged,
      allowCustom: true,
      allowSkip: true,
    };
  }

  private async loadPopularRegions(profile: UserProfile | null): Promise<HitlChoice[]> {
    const sidoCode = profile?.sidoCode ?? null;
    const session = this.neo4jDriver.session();
    try {
      const result = await session.run(
        `
        MATCH (r:Region)
        WHERE ($sidoCode IS NULL OR r.parentCode = $sidoCode OR r.code = $sidoCode)
        OPTIONAL MATCH (p:Policy)-[:AVAILABLE_IN]->(r)
        WITH r, count(p) AS policyCount
        WHERE policyCount > 0
        RETURN r.code AS code, r.name AS name, policyCount
        ORDER BY policyCount DESC
        LIMIT $limit
        `,
        { sidoCode, limit: HITL_CHOICE_LIMIT },
      );

      const choices = result.records
        .map((record) => ({
          id: record.get('code') as string,
          label: record.get('name') as string,
          description: `관련 정책 ${(record.get('policyCount') ?? 0).toString()}건`,
        }))
        .filter((choice) => Boolean(choice.id && choice.label));

      if (choices.length > 0) {
        return choices;
      }
    } catch (error) {
      this.logger.warn(`지역 추천 Neo4j 조회 실패: ${(error as Error).message}`);
    } finally {
      await session.close();
    }

    return this.fallbackSidoChoices(sidoCode);
  }

  private fallbackSidoChoices(sidoCode: string | null): HitlChoice[] {
    const base = [
      { id: '11', label: '서울특별시' },
      { id: '41', label: '경기도' },
      { id: '28', label: '인천광역시' },
      { id: '26', label: '부산광역시' },
      { id: '27', label: '대구광역시' },
    ];
    if (!sidoCode) return base;
    const self = base.find((item) => item.id === sidoCode);
    return self ? [self, ...base.filter((item) => item.id !== sidoCode)] : base;
  }

  private async loadPolicyNameCandidatesFromGraph(
    profile: UserProfile | null,
  ): Promise<string[]> {
    if (!profile) return [];
    const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
    const lifeStage = ageToLifeStage(age);
    const targetGroups = profileToTargetGroups(profile);

    const session = this.neo4jDriver.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Policy)
        OPTIONAL MATCH (p)-[:TARGETS_LIFE_STAGE]->(l:LifeStage {name: $lifeStage})
        WITH p, count(l) > 0 AS hasLifeStage
        OPTIONAL MATCH (p)-[:AVAILABLE_IN]->(r:Region {code: $sidoCode})
        WITH p, hasLifeStage, count(r) > 0 AS hasRegion
        OPTIONAL MATCH (p)-[:TARGETS_GROUP]->(g:TargetGroup) WHERE g.name IN $targetGroups
        WITH p, hasLifeStage, hasRegion, count(g) > 0 AS hasGroup
        WITH p,
          CASE WHEN hasLifeStage THEN 2 ELSE 0 END +
          CASE WHEN hasRegion   THEN 1 ELSE 0 END +
          CASE WHEN hasGroup    THEN 2 ELSE 0 END AS matchScore
        WHERE matchScore > 0
        RETURN p.name AS name
        ORDER BY matchScore DESC
        LIMIT $limit
        `,
        {
          lifeStage,
          sidoCode: profile.sidoCode ?? '',
          targetGroups: targetGroups.length > 0 ? targetGroups : ['__none__'],
          limit: HITL_CHOICE_LIMIT,
        },
      );

      return result.records
        .map((record) => record.get('name') as string)
        .filter(Boolean);
    } catch (error) {
      this.logger.warn(`정책명 그래프 추천 실패: ${(error as Error).message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  private async loadPolicyNameCandidatesFromVector(
    question: string,
    profile: UserProfile | null,
  ): Promise<string[]> {
    try {
      const age = profile?.birthDate ? calcAge(profile.birthDate) : 30;
      const profileText = profile ? buildProfileText(profile, age) : '';
      const queryText = [profileText, question].filter(Boolean).join(' / ');
      if (!queryText) return [];
      return await this.vectorRetrieval.searchSuggestionNames(queryText);
    } catch (error) {
      this.logger.warn(`정책명 벡터 추천 실패: ${(error as Error).message}`);
      return [];
    }
  }

  private async loadThemeChoicesFromGraph(
    profile: UserProfile | null,
  ): Promise<HitlChoice[]> {
    const age = profile?.birthDate ? calcAge(profile.birthDate) : 30;
    const lifeStage = ageToLifeStage(age);
    const targetGroups = profile ? profileToTargetGroups(profile) : [];

    const session = this.neo4jDriver.session();
    try {
      const result = await session.run(
        `
        MATCH (p:Policy)-[:HAS_THEME]->(t:Theme)
        OPTIONAL MATCH (p)-[:TARGETS_LIFE_STAGE]->(l:LifeStage {name: $lifeStage})
        OPTIONAL MATCH (p)-[:TARGETS_GROUP]->(g:TargetGroup) WHERE g.name IN $targetGroups
        WITH t, count(DISTINCT p) AS policyCount,
             count(DISTINCT l) AS lifeStageMatches,
             count(DISTINCT g) AS groupMatches
        WITH t, policyCount + lifeStageMatches * 2 + groupMatches * 2 AS score, policyCount
        WHERE policyCount > 0
        RETURN t.name AS name, policyCount, score
        ORDER BY score DESC
        LIMIT $limit
        `,
        {
          lifeStage,
          targetGroups: targetGroups.length > 0 ? targetGroups : ['__none__'],
          limit: HITL_CHOICE_LIMIT,
        },
      );

      return result.records
        .map((record): HitlChoice | null => {
          const name = record.get('name') as string;
          const count = Number(record.get('policyCount') ?? 0);
          if (!name) return null;
          return {
            id: name,
            label: name,
            description: count > 0 ? `관련 정책 ${count}건` : undefined,
          };
        })
        .filter((choice): choice is HitlChoice => choice !== null);
    } catch (error) {
      this.logger.warn(`테마 그래프 추천 실패: ${(error as Error).message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  private async loadThemeChoicesFromRetrieval(
    retrieval: RetrievalResult | null,
    question: string,
    profile: UserProfile | null,
  ): Promise<HitlChoice[]> {
    let items: RetrievalItem[] = retrieval?.items ?? [];

    if (items.length === 0) {
      try {
        const fallback = await this.vectorRetrieval.searchGeneralWelfare(
          question,
          [],
        );
        items = fallback.items;
      } catch (error) {
        this.logger.warn(`테마 벡터 fallback 실패: ${(error as Error).message}`);
      }
    }

    const counter = new Map<string, number>();
    for (const item of items) {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      const candidates = [
        metadata.theme,
        metadata.category,
        metadata.categoryName,
        metadata.serviceField,
      ];
      const themes = Array.isArray(metadata.themes) ? (metadata.themes as string[]) : [];
      const combined = [...candidates, ...themes]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      for (const name of combined) {
        counter.set(name, (counter.get(name) ?? 0) + 1);
      }
    }

    void profile;
    return [...counter.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, HITL_CHOICE_LIMIT)
      .map(([name, count]) => ({
        id: name,
        label: name,
        description: `후보 ${count}건`,
      }));
  }

  private generateId(prefix: string) {
    return `hitl_${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter((value) => value && value.trim()))];
}

function dedupeChoices(choices: HitlChoice[]) {
  const seen = new Set<string>();
  const unique: HitlChoice[] = [];
  for (const choice of choices) {
    const key = choice.id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(choice);
  }
  return unique;
}
