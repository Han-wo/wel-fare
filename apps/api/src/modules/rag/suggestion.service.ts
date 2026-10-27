import { Injectable } from '@nestjs/common';
import { calcAge } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { PolicyGraphService } from './policy-graph.service';
import { VectorRetrievalService } from './vector-retrieval.service';
import {
  buildProfileCacheFingerprint,
  buildProfileText,
  buildSuggestions,
  DEFAULT_SUGGESTIONS,
} from './retrieval-helpers';
import { RagCacheService } from './rag-cache.service';

const SUGGESTION_CACHE_TTL_SECONDS = 60 * 5;

/** 두 목록을 번갈아 합치고 중복을 제거한다. 한쪽이 짧으면 남은 쪽을 이어 붙인다. */
function interleave(primary: string[], secondary: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < Math.max(primary.length, secondary.length); i++) {
    if (i < primary.length) merged.push(primary[i]);
    if (i < secondary.length) merged.push(secondary[i]);
  }
  return [...new Set(merged)];
}

@Injectable()
export class SuggestionService {
  constructor(
    private readonly policyGraph: PolicyGraphService,
    private readonly vectorRetrieval: VectorRetrievalService,
    private readonly ragCache: RagCacheService,
  ) {}

  async getSuggestions(profile: UserProfileType | null): Promise<string[]> {
    if (!profile) {
      return DEFAULT_SUGGESTIONS;
    }

    const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
    const { value } = await this.ragCache.getOrLoad<string[]>({
      namespace: 'suggestions:final',
      keyParts: [buildProfileCacheFingerprint(profile), age],
      ttlSeconds: SUGGESTION_CACHE_TTL_SECONDS,
      dataVersionScope: 'all',
      loader: async () => {
        const profileText = buildProfileText(profile, age);

        const [qdrantNames, neo4jPolicyNames] = await Promise.all([
          this.vectorRetrieval.searchSuggestionNames(profileText),
          this.policyGraph.queryPolicyNameSuggestions(profile, age),
        ]);

        // 단순 concat(neo4j 먼저)이면 buildSuggestions의 slice(0,4)가 Neo4j
        // 결과만으로 채워진다. Neo4j 쪽은 matchScore 동점이 대량이라 정렬이
        // 사실상 임의고 분야 쏠림(주거·장애인)이 그대로 노출되므로, 분류당
        // 상한을 적용한 Qdrant 결과와 번갈아 배치해 두 신호를 모두 태운다.
        const allNames = interleave(neo4jPolicyNames, qdrantNames);
        return buildSuggestions(allNames, profile, age);
      },
    });

    return value;
  }
}
