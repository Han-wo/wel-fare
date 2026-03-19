import { Injectable } from '@nestjs/common';
import { calcAge } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { PolicyGraphService } from './policy-graph.service';
import { VectorRetrievalService } from './vector-retrieval.service';
import {
  buildProfileText,
  buildSuggestions,
  DEFAULT_SUGGESTIONS,
} from './retrieval-helpers';

@Injectable()
export class SuggestionService {
  private readonly suggestionsCache = new Map<string, { data: string[]; expiresAt: number }>();

  constructor(
    private readonly policyGraph: PolicyGraphService,
    private readonly vectorRetrieval: VectorRetrievalService,
  ) {}

  async getSuggestions(profile: UserProfileType | null): Promise<string[]> {
    if (!profile) {
      return DEFAULT_SUGGESTIONS;
    }

    const cacheKey = profile.userId ?? '';
    const cached = this.suggestionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
    const profileText = buildProfileText(profile, age);

    const [qdrantNames, neo4jPolicyNames] = await Promise.all([
      this.vectorRetrieval.searchSuggestionNames(profileText),
      this.policyGraph.queryPolicyNameSuggestions(profile, age),
    ]);

    const allNames = [...new Set([...neo4jPolicyNames, ...qdrantNames])];
    const suggestions = buildSuggestions(allNames, profile, age);

    if (cacheKey) {
      this.suggestionsCache.set(cacheKey, {
        data: suggestions,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    }

    return suggestions;
  }
}
