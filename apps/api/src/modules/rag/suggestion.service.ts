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

        const allNames = [...new Set([...neo4jPolicyNames, ...qdrantNames])];
        return buildSuggestions(allNames, profile, age);
      },
    });

    return value;
  }
}
