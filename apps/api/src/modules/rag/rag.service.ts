import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Driver } from 'neo4j-driver';
import { Document } from '@langchain/core/documents';
import { traceable } from 'langsmith/traceable';
import { createRagGraph } from './rag.graph';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';

export const NEO4J_DRIVER = 'NEO4J_DRIVER';

@Injectable()
export class RagService {
  private readonly embeddings: OpenAIEmbeddings;
  private readonly qdrantClient: QdrantClient;
  private readonly ragGraph: ReturnType<typeof createRagGraph>;

  constructor(
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    @InjectRepository(UserProfile) private profileRepo: Repository<UserProfile>,
    @InjectRepository(ChatMessage) private messageRepo: Repository<ChatMessage>,
    private config: ConfigService,
  ) {
    // wrapSDK: OpenAI 임베딩 호출도 LangSmith 트레이스에 포착
    this.embeddings = new OpenAIEmbeddings({
      model: this.config.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
      openAIApiKey: this.config.get('OPENAI_API_KEY'),
    });

    this.qdrantClient = new QdrantClient({
      url: this.config.get('QDRANT_URL', 'http://localhost:6333'),
    });

    this.ragGraph = createRagGraph({
      getProfile: this.getProfile.bind(this),
      // traceable로 감싸면 Neo4j Cypher 쿼리가 LangSmith에 "neo4j_ontology_infer" 스팬으로 표시됨
      inferFromOntology: traceable(this.inferFromOntology.bind(this), {
        name: 'neo4j_ontology_infer',
        run_type: 'retriever',
        tags: ['neo4j', 'ontology', 'cypher'],
      }),
      searchVectors: traceable(this.searchVectors.bind(this), {
        name: 'qdrant_vector_search',
        run_type: 'retriever',
        tags: ['qdrant', 'vector-search'],
      }),
      saveMessage: this.saveAssistantMessage.bind(this),
      calcAge,
      getSidoName,
    });
  }

  async *streamAnswer(
    userId: string,
    sessionId: string,
    question: string,
  ): AsyncGenerator<string> {
    const tokens: string[] = [];
    let resolver: (() => void) | null = null;
    let done = false;

    const streamCallback = (token: string) => {
      tokens.push(token);
      resolver?.();
    };

    this.ragGraph
      .invoke(
        {
          question,
          userId,
          sessionId,
          profile: null,
          candidatePolicyIds: [],
          documents: [],
          filteredDocuments: [],
          answer: '',
          streamCallback,
        },
        {
          // LangSmith 대시보드에서 이 이름으로 최상위 트레이스가 표시됨
          runName: 'welfare-rag-pipeline',
          tags: ['welfare-ai', 'rag', 'langgraph'],
          metadata: { userId, sessionId },
        },
      )
      .then(() => {
        done = true;
        resolver?.();
      })
      .catch(() => {
        done = true;
        resolver?.();
      });

    while (!done || tokens.length > 0) {
      if (tokens.length > 0) {
        yield tokens.shift()!;
      } else {
        await new Promise<void>((r) => {
          resolver = r;
        });
        resolver = null;
      }
    }
  }

  private async getProfile(userId: string): Promise<UserProfileType | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;
    return profile as unknown as UserProfileType;
  }

  private async inferFromOntology(
    profile: UserProfileType,
    _question: string,
  ): Promise<string[]> {
    const session = this.neo4jDriver.session();
    try {
      const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
      const result = await session.run(
        `
        MATCH (p:Policy)
        WHERE p.status = 'ACTIVE'
        WITH p
        MATCH (p)-[:REQUIRES]->(req:Requirement)
        WHERE (
          (req.reqType = 'AGE' AND $age >= req.minValue AND $age <= req.maxValue)
          OR (req.reqType = 'INCOME' AND $bracket <= req.maxValue)
          OR (req.reqType = 'REGION' AND ($sidoCode IN req.valueList OR 'ALL' IN req.valueList))
          OR (req.reqType = 'HOUSEHOLD' AND $household IN req.valueList)
          OR (req.reqType = 'EMPLOYMENT' AND $occupation IN req.valueList)
        )
        WITH p, count(req) AS matchScore
        ORDER BY matchScore DESC
        RETURN p.id AS policyId
        LIMIT 50
        `,
        {
          age,
          bracket: profile.incomeBracket ?? 200,
          sidoCode: profile.sidoCode ?? 'ALL',
          household: profile.householdType ?? 'FAMILY',
          occupation: profile.occupationType ?? 'EMPLOYEE',
        },
      );
      return result.records.map((r) => r.get('policyId') as string);
    } catch {
      return [];
    } finally {
      await session.close();
    }
  }

  private async searchVectors(question: string, policyIds: string[]): Promise<Document[]> {
    const collectionName = this.config.get('QDRANT_COLLECTION', 'welfare_policies');
    const queryVector = await this.embeddings.embedQuery(question);

    const searchResult = await this.qdrantClient.search(collectionName, {
      vector: queryVector,
      limit: 8,
      filter:
        policyIds.length > 0
          ? { must: [{ key: 'policyId', match: { any: policyIds } }] }
          : undefined,
      with_payload: true,
      score_threshold: 0.6,
    });

    return searchResult.map((r) => ({
      pageContent: (r.payload?.text as string) ?? '',
      metadata: { ...r.payload, score: r.score },
    }));
  }

  private async saveAssistantMessage(
    sessionId: string,
    role: string,
    content: string,
  ): Promise<void> {
    await this.messageRepo.save(this.messageRepo.create({ sessionId, role, content }));
  }
}
