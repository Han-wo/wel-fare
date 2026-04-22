import { Inject, Injectable } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import { calcAge } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { TraceFacade } from './trace-facade.service';
import {
  ageToLifeStage,
  buildProfileCacheFingerprint,
  profileToTargetGroups,
} from './retrieval-helpers';
import { NEO4J_DRIVER } from './rag.tokens';
import { buildOntologyMatchTrace, buildPolicyExpansionTrace } from './policy-trace-mapper';
import { RagCacheService } from './rag-cache.service';

const POLICY_GRAPH_CACHE_TTL_SECONDS = 60 * 10;

@Injectable()
export class PolicyGraphService {
  constructor(
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    private readonly ragCache: RagCacheService,
    private readonly traceFacade: TraceFacade,
  ) {}

  async inferFromOntology(profile: UserProfileType, traceId?: string): Promise<string[]> {
    try {
      const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
      const lifeStage = ageToLifeStage(age);
      const targetGroups = profileToTargetGroups(profile);
      const { value, hit } = await this.ragCache.getOrLoad<string[]>({
        namespace: 'graph:policy-ontology',
        keyParts: [buildProfileCacheFingerprint(profile), age],
        ttlSeconds: POLICY_GRAPH_CACHE_TTL_SECONDS,
        dataVersionScope: 'policy',
        loader: async () => {
          const session = this.neo4jDriver.session();
          try {
            const result = await session.run(
              `
              MATCH (p:Policy)
              OPTIONAL MATCH (p)-[:TARGETS_LIFE_STAGE]->(l:LifeStage {name: $lifeStage})
              WITH p, collect(DISTINCT l.name) AS lifeStages
              OPTIONAL MATCH (p)-[:AVAILABLE_IN]->(r:Region {code: $sidoCode})
              WITH p, lifeStages, collect(DISTINCT r.name) AS regions
              OPTIONAL MATCH (p)-[:TARGETS_GROUP]->(g:TargetGroup) WHERE g.name IN $targetGroups
              WITH p, lifeStages, regions, collect(DISTINCT g.name) AS targetGroups
              WITH p,
                lifeStages,
                regions,
                targetGroups,
                CASE WHEN size(lifeStages) > 0 THEN 2 ELSE 0 END +
                CASE WHEN size(regions) > 0 THEN 1 ELSE 0 END +
                CASE WHEN size(targetGroups) > 0 THEN 2 ELSE 0 END AS matchScore
              WHERE matchScore > 0
              ORDER BY matchScore DESC
              RETURN p.id AS policyId, p.name AS policyName, lifeStages, regions, targetGroups, matchScore
              LIMIT 50
              `,
              {
                lifeStage,
                sidoCode: profile.sidoCode ?? '',
                targetGroups: targetGroups.length > 0 ? targetGroups : ['__none__'],
              },
            );

            const ids = result.records.map((record) => record.get('policyId') as string);

            if (traceId) {
              this.traceFacade.recordGraphWalk(
                traceId,
                buildOntologyMatchTrace({
                  traceId,
                  profile,
                  age,
                  lifeStage,
                  targetGroups,
                  records: result.records,
                  totalCount: ids.length,
                }),
              );
            }

            return ids;
          } finally {
            await session.close();
          }
        },
      });

      this.traceCacheDecision(
        traceId,
        '정책 ontology 추론',
        hit,
        'graph:policy-ontology',
      );
      return value;
    } catch {
      return [];
    }
  }

  async enrichWithGraphData(policyIds: string[], traceId?: string): Promise<string> {
    const validIds = policyIds.filter((id) => !id.startsWith('facility_') && !id.startsWith('housing_'));
    if (validIds.length === 0) return '';

    try {
      const normalizedIds = [...new Set(validIds)].sort();
      const { value, hit } = await this.ragCache.getOrLoad<string>({
        namespace: 'graph:policy-enrichment',
        keyParts: [normalizedIds],
        ttlSeconds: POLICY_GRAPH_CACHE_TTL_SECONDS,
        dataVersionScope: 'policy',
        loader: async () => {
          const session = this.neo4jDriver.session();
          try {
            const [detailRes, relatedRes] = await Promise.all([
              session.run(
                `
                UNWIND $policyIds AS pid
                MATCH (p:Policy {id: pid})
                OPTIONAL MATCH (p)-[:TARGETS_LIFE_STAGE]->(l:LifeStage)
                OPTIONAL MATCH (p)-[:TARGETS_GROUP]->(g:TargetGroup)
                OPTIONAL MATCH (p)-[:HAS_THEME]->(t:Theme)
                OPTIONAL MATCH (p)-[:AVAILABLE_IN]->(r:Region)
                RETURN
                  p.id AS id, p.name AS name,
                  collect(DISTINCT l.name) AS lifeStages,
                  collect(DISTINCT g.name) AS targetGroups,
                  collect(DISTINCT t.name) AS themes,
                  collect(DISTINCT r.name) AS regions
                `,
                { policyIds: normalizedIds },
              ),
              session.run(
                `
                MATCH (p:Policy)-[:HAS_THEME]->(t:Theme)<-[:HAS_THEME]-(related:Policy)
                WHERE p.id IN $policyIds AND NOT related.id IN $policyIds
                WITH related, count(t) AS sharedThemes
                ORDER BY sharedThemes DESC
                RETURN DISTINCT related.name AS name
                LIMIT 5
                `,
                { policyIds: normalizedIds },
              ),
            ]);

            const lines: string[] = [];

            for (const record of detailRes.records) {
              const name = record.get('name') as string;
              const lifeStages = (record.get('lifeStages') as string[]).filter(Boolean);
              const targetGroups = (record.get('targetGroups') as string[]).filter(Boolean);
              const themes = (record.get('themes') as string[]).filter(Boolean);
              const regions = (record.get('regions') as string[]).filter(Boolean);

              if (lifeStages.length || targetGroups.length || themes.length || regions.length) {
                lines.push(`[${name}]`);
                if (lifeStages.length) lines.push(`  - 대상 생애주기: ${lifeStages.join(', ')}`);
                if (targetGroups.length) lines.push(`  - 지원 대상 그룹: ${targetGroups.join(', ')}`);
                if (themes.length) lines.push(`  - 관련 주제: ${themes.join(', ')}`);
                if (regions.length) {
                  lines.push(
                    `  - 제공 지역: ${
                      regions.length > 5 ? `${regions.slice(0, 5).join(', ')} 외` : regions.join(', ')
                    }`,
                  );
                }
              }
            }

            const relatedNames = relatedRes.records
              .map((record) => record.get('name') as string)
              .filter(Boolean);
            if (relatedNames.length) {
              lines.push('');
              lines.push(`[연관 정책]: ${relatedNames.join(', ')}`);
            }

            if (traceId) {
              this.traceFacade.recordGraphWalk(
                traceId,
                buildPolicyExpansionTrace({
                  records: detailRes.records,
                  relatedNames,
                }),
              );
            }

            return lines.join('\n');
          } finally {
            await session.close();
          }
        },
      });

      this.traceCacheDecision(
        traceId,
        '정책 그래프 보강',
        hit,
        'graph:policy-enrichment',
      );
      return value;
    } catch {
      return '';
    }
  }

  async queryPolicyNameSuggestions(profile: UserProfileType, age: number): Promise<string[]> {
    try {
      const lifeStage = ageToLifeStage(age);
      const targetGroups = profileToTargetGroups(profile);
      const { value } = await this.ragCache.getOrLoad<string[]>({
        namespace: 'graph:policy-name-suggestions',
        keyParts: [buildProfileCacheFingerprint(profile), age],
        ttlSeconds: POLICY_GRAPH_CACHE_TTL_SECONDS,
        dataVersionScope: 'policy',
        loader: async () => {
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
              ORDER BY matchScore DESC
              RETURN p.name AS name
              LIMIT 8
              `,
              {
                lifeStage,
                sidoCode: profile.sidoCode ?? '',
                targetGroups: targetGroups.length > 0 ? targetGroups : ['__none__'],
              },
            );

            return result.records
              .map((record) => record.get('name') as string)
              .filter(Boolean);
          } finally {
            await session.close();
          }
        },
      });

      return value;
    } catch {
      return [];
    }
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
        ? 'Redis 캐시된 그래프 결과를 사용했습니다.'
        : 'Redis 캐시 미스로 Neo4j 조회를 실행했습니다.',
      payload: {
        cache: 'redis',
        namespace,
      },
    });
  }
}
