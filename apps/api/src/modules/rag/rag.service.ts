import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Driver } from 'neo4j-driver';
import { Document } from '@langchain/core/documents';
import { traceable } from 'langsmith/traceable';
import { createRagGraph, RagServices } from './rag.graph';
import { createEligibilityGraph } from './eligibility.graph';
import { createApplicationAssistGraph } from './application-assist.graph';
import { RagTraceService } from './rag-trace.service';
import type { RagTraceEdge, RagTraceNode } from './entities/rag-trace.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatRuntimeService } from '../chat/chat-runtime.service';
import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { RagRouterService, type RagRouteType } from './rag-router.service';

export const NEO4J_DRIVER = 'NEO4J_DRIVER';

export type RagStreamEvent =
  | { type: 'session_created'; data: string }
  | { type: 'think'; data: '' }
  | { type: 'text'; data: string }
  | { type: 'done'; data: '' };

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly qdrantClient: QdrantClient;
  private readonly searchGraph: ReturnType<typeof createRagGraph>;
  private readonly eligibilityGraph: ReturnType<typeof createEligibilityGraph>;
  private readonly applicationAssistGraph: ReturnType<typeof createApplicationAssistGraph>;
  private readonly collectionName: string;
  // 추천 질문 캐시: userId → { data, expiresAt } (5분 TTL)
  private readonly suggestionsCache = new Map<string, { data: string[]; expiresAt: number }>();
  // 온톨로지 추론 캐시: userId → { ids, expiresAt } (10분 TTL)
  // inferFromOntology는 프로필 기반 고정 결과 → 동일 유저 반복 호출 시 Neo4j 조회 생략
  private readonly ontologyCache = new Map<string, { ids: string[]; expiresAt: number }>();

  constructor(
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    @InjectRepository(UserProfile) private profileRepo: Repository<UserProfile>,
    @InjectRepository(ChatMessage) private messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    private readonly ragTrace: RagTraceService,
    private readonly chatRuntime: ChatRuntimeService,
    private readonly ragRouter: RagRouterService,
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

    this.collectionName = this.config.get('QDRANT_COLLECTION', 'welfare_policies');

    const services: RagServices = {
      getProfile: this.getProfile.bind(this),
      inferFromOntology: traceable(this.inferFromOntology.bind(this), {
        name: 'neo4j_ontology_infer',
        run_type: 'retriever',
        tags: ['neo4j', 'ontology', 'cypher'],
      }),
      enrichWithGraph: traceable(this.enrichWithGraphData.bind(this), {
        name: 'neo4j_graph_enrich',
        run_type: 'retriever',
        tags: ['neo4j', 'graph', 'cypher'],
      }),
      searchVectors: traceable(this.searchVectors.bind(this), {
        name: 'qdrant_vector_search',
        run_type: 'retriever',
        tags: ['qdrant', 'vector-search'],
      }),
      searchYouthPolicies: traceable(this.searchYouthPolicies.bind(this), {
        name: 'qdrant_youth_search',
        run_type: 'retriever',
        tags: ['qdrant', 'youth'],
      }),
      searchByPolicyName: traceable(this.searchByPolicyName.bind(this), {
        name: 'qdrant_policy_name_search',
        run_type: 'retriever',
        tags: ['qdrant', 'eligibility'],
      }),
      searchHousingSubscriptions: traceable(this.searchHousingSubscriptions.bind(this), {
        name: 'housing_subscription_search',
        run_type: 'retriever',
        tags: ['neo4j', 'qdrant', 'housing-subscription'],
      }),
      searchRentalSupport: traceable(this.searchRentalSupport.bind(this), {
        name: 'rental_support_search',
        run_type: 'retriever',
        tags: ['qdrant', 'lh-housing', 'rental'],
      }),
      searchWelfareFacilities: traceable(this.searchWelfareFacilities.bind(this), {
        name: 'welfare_facility_search',
        run_type: 'retriever',
        tags: ['qdrant', 'welfare-facility'],
      }),
      getUpcomingDeadlines: traceable(this.getUpcomingDeadlines.bind(this), {
        name: 'upcoming_deadlines',
        run_type: 'retriever',
        tags: ['neo4j', 'deadline'],
      }),
      loadHistory: this.loadChatHistory.bind(this),
      saveMessage: this.saveAssistantMessage.bind(this),
      recordContext: this.ragTrace.recordContext.bind(this.ragTrace),
      recordEvent: this.ragTrace.addEvent.bind(this.ragTrace),
      recordToolSelection: this.ragTrace.recordToolSelection.bind(this.ragTrace),
      calcAge,
      getSidoName,
    };

    this.searchGraph = createRagGraph(services);
    this.eligibilityGraph = createEligibilityGraph(services);
    this.applicationAssistGraph = createApplicationAssistGraph(services);
  }

  async *streamAnswer(
    userId: string,
    sessionId: string,
    question: string,
  ): AsyncGenerator<RagStreamEvent> {
    await this.ensureSessionOwnership(userId, sessionId);
    this.chatRuntime.openSession(sessionId);
    await this.saveUserMessage(sessionId, question);

    const traceId = this.ragTrace.startTrace({
      sessionId,
      userId,
      question,
      model: this.config.get('OPENAI_CHAT_MODEL', 'gpt-5-mini'),
    });
    const routeDecision = this.ragRouter.resolve(question);
    this.ragTrace.setRouteType(traceId, {
      routeType: routeDecision.routeType,
      detail: routeDecision.detail,
    });
    const streamToken = this.chatRuntime.startStream(sessionId);
    const events: RagStreamEvent[] = [
      { type: 'session_created', data: sessionId },
      { type: 'think', data: '' },
    ];
    let resolver: (() => void) | null = null;
    let done = false;
    let emittedText = false;

    const streamCallback = (token: string) => {
      if (this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        return;
      }

      emittedText = true;
      events.push({ type: 'text', data: token });
      resolver?.();
    };

    this.getGraphForRoute(routeDecision.routeType)
      .invoke(
        {
          question,
          userId,
          sessionId,
          traceId,
          messages: [],
          profile: null,
          answer: '',
          streamCallback,
        },
        {
          // LangSmith 대시보드에서 이 이름으로 최상위 트레이스가 표시됨
          runName: 'welfare-rag-pipeline',
          tags: ['welfare-ai', 'rag', 'langgraph'],
          metadata: { userId, sessionId, traceId },
        },
      )
      .then(async (result) => {
        const answer = typeof result?.answer === 'string' ? result.answer : '';
        if (answer && !emittedText && !this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
          events.push({ type: 'text', data: answer });
        }
        if (answer) {
          this.ragTrace.recordAnswer(traceId, answer);
        }
        await this.ragTrace.finalizeTrace(traceId, {
          status: 'SUCCESS',
          answer: answer || null,
        });
        done = true;
        events.push({ type: 'done', data: '' });
        resolver?.();
      })
      .catch(async (err) => {
        this.logger.error('RAG 파이프라인 오류:', err);
        this.ragTrace.recordError(traceId, (err as Error).message);
        await this.ragTrace.finalizeTrace(traceId, {
          status: 'FAILED',
          error: (err as Error).message,
        });
        events.push({ type: 'text', data: `\n\n⚠️ 오류가 발생했습니다: ${(err as Error).message}` });
        done = true;
        events.push({ type: 'done', data: '' });
        resolver?.();
      });

    try {
      while ((!done || events.length > 0) && !this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        if (events.length > 0) {
          yield events.shift()!;
          continue;
        }

        await new Promise<void>((r) => {
          resolver = r;
          this.chatRuntime.setWakeHandler(sessionId, streamToken, r);
        });
        resolver = null;
        this.chatRuntime.setWakeHandler(sessionId, streamToken);
      }

      if (!done && this.chatRuntime.isStreamClosed(sessionId, streamToken)) {
        await this.ragTrace.finalizeTrace(traceId, {
          status: 'ABORTED',
        });
        yield { type: 'done', data: '' };
      }
    } finally {
      this.chatRuntime.finishStream(sessionId, streamToken);
    }
  }

  private getGraphForRoute(routeType: RagRouteType) {
    switch (routeType) {
      case 'ELIGIBILITY':
        return this.eligibilityGraph;
      case 'APPLICATION_ASSIST':
        return this.applicationAssistGraph;
      case 'SEARCH':
      default:
        return this.searchGraph;
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
    traceId?: string,
  ): Promise<string[]> {
    // 캐시 확인: 프로필 기반 결과는 10분간 재사용 (Neo4j 조회 생략)
    const cacheKey = profile.userId ?? '';
    const cached = this.ontologyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.ids;

    const session = this.neo4jDriver.session();
    try {
      const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
      const lifeStage = ageToLifeStage(age);
      const targetGroups = profileToTargetGroups(profile);

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
      const ids = result.records.map((r) => r.get('policyId') as string);
      if (traceId) {
        const age = profile.birthDate ? calcAge(profile.birthDate) : 30;
        const criteriaNodes: RagTraceNode[] = [
          { id: `profile:${traceId}`, label: '사용자 프로필', kind: 'profile' },
          { id: `criteria:${traceId}:lifeStage:${lifeStage}`, label: lifeStage, kind: 'LifeStage' },
        ];
        const criteriaEdges: RagTraceEdge[] = [
          {
            id: `profile:${traceId}->criteria:${traceId}:lifeStage:${lifeStage}:HAS_LIFE_STAGE`,
            source: `profile:${traceId}`,
            target: `criteria:${traceId}:lifeStage:${lifeStage}`,
            label: 'HAS_LIFE_STAGE',
          },
        ];

        if (profile.sidoCode) {
          criteriaNodes.push({
            id: `criteria:${traceId}:region:${profile.sidoCode}`,
            label: getSidoName(profile.sidoCode),
            kind: 'Region',
          });
          criteriaEdges.push({
            id: `profile:${traceId}->criteria:${traceId}:region:${profile.sidoCode}:IN_REGION`,
            source: `profile:${traceId}`,
            target: `criteria:${traceId}:region:${profile.sidoCode}`,
            label: 'IN_REGION',
          });
        }

        for (const group of targetGroups) {
          criteriaNodes.push({
            id: `criteria:${traceId}:group:${group}`,
            label: group,
            kind: 'TargetGroup',
          });
          criteriaEdges.push({
            id: `profile:${traceId}->criteria:${traceId}:group:${group}:HAS_GROUP`,
            source: `profile:${traceId}`,
            target: `criteria:${traceId}:group:${group}`,
            label: 'HAS_GROUP',
          });
        }

        const policyNodes: RagTraceNode[] = [];
        const policyEdges: RagTraceEdge[] = [];
        const topPolicies: Array<{ id: string; name: string; score: number }> = [];

        for (const record of result.records.slice(0, 12)) {
          const policyId = record.get('policyId') as string;
          const policyName = record.get('policyName') as string;
          const matchedLifeStages = (record.get('lifeStages') as string[]).filter(Boolean);
          const matchedRegions = (record.get('regions') as string[]).filter(Boolean);
          const matchedGroups = (record.get('targetGroups') as string[]).filter(Boolean);
          const matchScore = Number(record.get('matchScore') as number);

          topPolicies.push({ id: policyId, name: policyName, score: matchScore });
          policyNodes.push({
            id: policyNodeId(policyId),
            label: policyName,
            kind: 'Policy',
            score: matchScore,
          });

          for (const value of matchedLifeStages) {
            policyEdges.push({
              id: `criteria:${traceId}:lifeStage:${value}->${policyNodeId(policyId)}:TARGETS_LIFE_STAGE`,
              source: `criteria:${traceId}:lifeStage:${value}`,
              target: policyNodeId(policyId),
              label: 'TARGETS_LIFE_STAGE',
            });
          }

          for (const value of matchedRegions) {
            const regionId = `criteria:${traceId}:region:${profile.sidoCode ?? value}`;
            policyEdges.push({
              id: `${regionId}->${policyNodeId(policyId)}:AVAILABLE_IN`,
              source: regionId,
              target: policyNodeId(policyId),
              label: 'AVAILABLE_IN',
            });
          }

          for (const value of matchedGroups) {
            policyEdges.push({
              id: `criteria:${traceId}:group:${value}->${policyNodeId(policyId)}:TARGETS_GROUP`,
              source: `criteria:${traceId}:group:${value}`,
              target: policyNodeId(policyId),
              label: 'TARGETS_GROUP',
            });
          }
        }

        this.ragTrace.recordGraphWalk(traceId, {
          title: 'Neo4j 프로필 그래프 매칭',
          detail: `${age}세 · ${lifeStage} 기준으로 ${ids.length}개 정책 후보를 추렸습니다.`,
          nodes: [...criteriaNodes, ...policyNodes],
          edges: [...criteriaEdges, ...policyEdges],
          payload: {
            topPolicies,
            lifeStage,
            targetGroups,
            region: profile.sidoCode ? getSidoName(profile.sidoCode) : null,
          },
        });
      }
      // 결과 캐시 (10분 TTL)
      if (cacheKey) {
        this.ontologyCache.set(cacheKey, { ids, expiresAt: Date.now() + 10 * 60 * 1000 });
      }
      return ids;
    } catch {
      return [];
    } finally {
      await session.close();
    }
  }

  private async searchVectors(question: string, policyIds: string[], traceId?: string): Promise<Document[]> {
    const queryVector = await this.embeddings.embedQuery(question);
    // policyIds가 있으면 Neo4j 온톨로지 매칭 결과로 필터
    // 없으면 bokjiro/local_bokjiro 소스만 검색 (타 소스 오염 방지)
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
    return searchResult.map((r) => ({
      pageContent: (r.payload?.content as string) ?? '',
      metadata: { ...r.payload, score: r.score },
    }));
  }

  /**
   * 유저 프로필 기반 추천 질문 생성
   * - AI 없음: Neo4j 그래프 매칭 + Qdrant 벡터서치 → 템플릿 조합
   * - 임베딩 비용만 발생 (~$0.0001/요청, text-embedding-3-small)
   */
  async getSuggestions(userId: string): Promise<string[]> {
    const cached = this.suggestionsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const profile = await this.getProfile(userId);
    if (!profile) return DEFAULT_SUGGESTIONS;

    const age = profile.birthDate ? calcAge(profile.birthDate) : 30;

    // 1. 프로필 텍스트를 임베딩 → Qdrant 유사 정책 검색
    const profileText = buildProfileText(profile, age);
    const queryVector = await this.embeddings.embedQuery(profileText);

    const [qdrantResults, neo4jPolicyNames] = await Promise.all([
      this.qdrantClient
        .search(this.collectionName, { vector: queryVector, limit: 8, with_payload: true, score_threshold: 0.45 })
        .catch(() => []),
      this.queryNeo4jPolicyNames(profile, age),
    ]);

    // 2. Qdrant 결과에서 정책명 추출
    const qdrantNames = qdrantResults
      .map((r) => extractPolicyName(((r.payload?.content ?? r.payload?.text) as string) ?? ''))
      .filter((n): n is string => n !== null && n.length < 35);

    // 3. Neo4j + Qdrant 정책명 합산 후 질문 템플릿 생성
    const allNames = [...new Set([...neo4jPolicyNames, ...qdrantNames])];
    const suggestions = buildSuggestions(allNames, profile, age);

    this.suggestionsCache.set(userId, { data: suggestions, expiresAt: Date.now() + 5 * 60 * 1000 });
    return suggestions;
  }

  private async queryNeo4jPolicyNames(profile: UserProfileType, age: number): Promise<string[]> {
    const session = this.neo4jDriver.session();
    try {
      const lifeStage = ageToLifeStage(age);
      const targetGroups = profileToTargetGroups(profile);

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
      return result.records.map((r) => r.get('name') as string).filter(Boolean);
    } catch {
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 이전 대화 히스토리 로드 (멀티턴용)
   */
  async loadChatHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 10,
    });
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * 청년정책 전용 Qdrant 검색 (source: 'youth_center')
   * - 일반 복지보다 임계값을 낮게 설정해 청년정책 커버리지 확대
   */
  async searchYouthPolicies(question: string, traceId?: string): Promise<Document[]> {
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
    return searchResult.map((r) => ({
      pageContent: (r.payload?.content as string) ?? '',
      metadata: { ...r.payload, score: r.score },
    }));
  }

  /**
   * 정책명 기반 상세 조회 (적격 여부 확인용)
   * - 모든 소스 대상, 임계값 높게 설정해 정확한 매칭 우선
   */
  async searchByPolicyName(policyName: string, traceId?: string): Promise<Document[]> {
    const queryVector = await this.embeddings.embedQuery(policyName);
    const searchResult = await this.qdrantClient.search(this.collectionName, {
      vector: queryVector,
      limit: 3,
      with_payload: true,
      score_threshold: 0.5,
    });
    this.traceVectorSearch(traceId, '정책명 기반 적격성 검색', policyName, searchResult);
    return searchResult.map((r) => ({
      pageContent: (r.payload?.content as string) ?? '',
      metadata: { ...r.payload, score: r.score },
    }));
  }

  /**
   * 청약·분양 공고 검색
   * - Neo4j HousingAnnouncement (구조화 데이터, 날짜·지역 필터)
   * - Qdrant applyhome + myhome_announcement (벡터 semantic 검색)
   */
  async searchHousingSubscriptions(question: string, sidoCode: string, traceId?: string): Promise<Document[]> {
    const docs: Document[] = [];

    // ── Neo4j HousingAnnouncement ─────────────────────────────
    const session = this.neo4jDriver.session();
    try {
      const annoRes = await session.run(
        `
        MATCH (a:HousingAnnouncement)
        WHERE a.annoDate >= '2025'
        WITH a
        OPTIONAL MATCH (a)-[:AVAILABLE_IN]->(r:Region)
        WITH a, collect(DISTINCT r.name) AS regionNames, collect(DISTINCT r.code) AS regionCodes
        WHERE $sidoCode = '' OR $sidoCode IN regionCodes
        RETURN a, regionNames
        ORDER BY a.annoDate DESC
        LIMIT 10
        `,
        { sidoCode },
      );
      for (const record of annoRes.records) {
        const a = record.get('a').properties as Record<string, string>;
        const regionNames = (record.get('regionNames') as string[]).filter(Boolean);
        docs.push({
          pageContent: [
            `[공고명] ${a.name}`,
            `[유형] ${a.suplyTyNm || '청약'} (${a.houseTyNm || '공고 참조'})`,
            regionNames.length ? `[청약지역] ${regionNames.join(', ')}` : '',
            `[공급세대수] ${a.suplyHoCo || ''}세대`,
            a.annoDate ? `[모집공고일] ${a.annoDate}` : '',
            a.subscptBgnde ? `[청약접수] ${a.subscptBgnde} ~ ${a.subscptEndde || ''}` : '',
            a.winnerDate ? `[당첨자발표] ${a.winnerDate}` : '',
            a.moveInYM ? `[입주예정] ${a.moveInYM}` : '',
            `[시행기관] ${a.insttNm || ''}`,
            `[신청링크] ${a.pcUrl || 'https://www.applyhome.co.kr'}`,
          ]
            .filter(Boolean)
            .join('\n'),
          metadata: { policyId: a.id, source: 'housing_announcement', score: 0.9 },
        });
      }
      if (traceId) {
        this.ragTrace.recordGraphWalk(traceId, {
          title: 'Neo4j 청약 공고 탐색',
          detail: `${annoRes.records.length}개의 모집공고 노드를 조회했습니다.`,
          nodes: annoRes.records.flatMap((record) => {
            const announcement = record.get('a').properties as Record<string, string>;
            const regions = (record.get('regionNames') as string[]).filter(Boolean);
            return [
              {
                id: policyNodeId(String(announcement.id)),
                label: announcement.name,
                kind: 'HousingAnnouncement',
              },
              ...regions.map((region) => ({
                id: `region:${region}`,
                label: region,
                kind: 'Region',
              })),
            ];
          }),
          edges: annoRes.records.flatMap((record) => {
            const announcement = record.get('a').properties as Record<string, string>;
            return ((record.get('regionNames') as string[]) ?? [])
              .filter(Boolean)
              .map((region) => ({
                id: `${policyNodeId(String(announcement.id))}->region:${region}:AVAILABLE_IN`,
                source: policyNodeId(String(announcement.id)),
                target: `region:${region}`,
                label: 'AVAILABLE_IN',
              }));
          }),
        });
      }
      this.logger.log(`청약공고 조회: ${annoRes.records.length}건 (sidoCode=${sidoCode})`);
    } catch (err) {
      this.logger.error('청약공고 Neo4j 조회 오류:', err);
    } finally {
      await session.close();
    }

    // ── Qdrant applyhome / myhome_announcement / cmpet / stat ─
    // applyhome_cmpet: 청약 경쟁률 ("이 청약 경쟁률 어떻게 돼?")
    // applyhome_stat: 청약 유형별 통계 ("행복주택 평균 경쟁률")
    try {
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
      docs.push(
        ...qdrantRes.map((r) => ({
          pageContent: (r.payload?.content as string) ?? '',
          metadata: { ...r.payload, score: r.score },
        })),
      );
      this.traceVectorSearch(traceId, 'Qdrant 청약 공고 검색', question, qdrantRes, {
        should: [
          { key: 'source', match: { value: 'applyhome' } },
          { key: 'source', match: { value: 'myhome_announcement' } },
          { key: 'source', match: { value: 'applyhome_cmpet' } },
          { key: 'source', match: { value: 'applyhome_stat' } },
        ],
      });
    } catch (err) {
      this.logger.error('청약 Qdrant 조회 오류:', err);
    }

    return docs;
  }

  /**
   * 전세·월세 지원금 검색
   * - Qdrant lh_housing (LH 공공임대단지)
   * - Qdrant bokjiro (주거급여, 전세자금 등 주거 관련 복지)
   * - Neo4j HousingComplex (LH 임대단지 구조화 정보)
   */
  async searchRentalSupport(question: string, sidoCode: string, traceId?: string): Promise<Document[]> {
    const docs: Document[] = [];

    // ── Qdrant lh_housing + bokjiro (병렬) ───────────────────
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
      docs.push(
        ...[...lhResults, ...bokjiroResults].map((r) => ({
          pageContent: (r.payload?.content as string) ?? '',
          metadata: { ...r.payload, score: r.score },
        })),
      );
      this.traceVectorSearch(traceId, 'Qdrant 주거 지원 검색', question, [...lhResults, ...bokjiroResults], {
        sources: ['lh_housing', 'bokjiro'],
      });
    } catch (err) {
      this.logger.error('임대지원 Qdrant 조회 오류:', err);
    }

    // ── Neo4j HousingComplex ──────────────────────────────────
    const session = this.neo4jDriver.session();
    try {
      const complexRes = await session.run(
        `
        MATCH (h:HousingComplex)-[:LOCATED_IN]->(r:Region)
        WHERE $sidoCode = '' OR r.code = $sidoCode
        RETURN h, r.name AS regionName
        ORDER BY h.hshldCo DESC
        LIMIT 5
        `,
        { sidoCode },
      );
      for (const record of complexRes.records) {
        const h = record.get('h').properties as Record<string, unknown>;
        const rName = record.get('regionName') as string;
        docs.push({
          pageContent: [
            `[단지명] ${rName} ${h.sigungu || ''} 공공임대주택`,
            `[유형] LH 공공임대단지`,
            `[주소] ${h.address || ''}`,
            `[세대수] ${h.hshldCo || ''}세대`,
            `[관리기관] ${h.manager || ''}`,
            `[신청링크] https://www.lh.or.kr`,
          ].join('\n'),
          metadata: { policyId: h.id, source: 'housing_complex', score: 0.85 },
        });
      }
      if (traceId) {
        this.ragTrace.recordGraphWalk(traceId, {
          title: 'Neo4j 공공임대단지 탐색',
          detail: `${complexRes.records.length}개의 임대단지 노드를 조회했습니다.`,
          nodes: complexRes.records.flatMap((record) => {
            const complex = record.get('h').properties as Record<string, unknown>;
            const regionName = record.get('regionName') as string;
            return [
              {
                id: policyNodeId(String(complex.id)),
                label: `${regionName} ${String(complex.sigungu ?? '')}`.trim(),
                kind: 'HousingComplex',
              },
              {
                id: `region:${regionName}`,
                label: regionName,
                kind: 'Region',
              },
            ];
          }),
          edges: complexRes.records.map((record) => {
            const complex = record.get('h').properties as Record<string, unknown>;
            const regionName = record.get('regionName') as string;
            return {
              id: `${policyNodeId(String(complex.id))}->region:${regionName}:LOCATED_IN`,
              source: policyNodeId(String(complex.id)),
              target: `region:${regionName}`,
              label: 'LOCATED_IN',
            };
          }),
        });
      }
    } catch (err) {
      this.logger.error('주택단지 Neo4j 조회 오류:', err);
    } finally {
      await session.close();
    }

    return docs;
  }

  /**
   * 복지 시설 검색
   * - Qdrant welfare_facility (시설명, 유형, 주소 등)
   */
  async searchWelfareFacilities(
    question: string,
    facilityType: string,
    _sidoCode: string,
    traceId?: string,
  ): Promise<Document[]> {
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
    });
    return searchResult.map((r) => ({
      pageContent: (r.payload?.content as string) ?? '',
      metadata: { ...r.payload, score: r.score },
    }));
  }

  /**
   * 신청 마감 임박 청약 목록
   * - Neo4j HousingAnnouncement 날짜 필터 (오늘 기준 청약 접수 중)
   */
  async getUpcomingDeadlines(sidoCode: string, traceId?: string): Promise<Document[]> {
    // YYYYMMDD 형식 (applyhome 날짜 포맷)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const session = this.neo4jDriver.session();
    try {
      const result = await session.run(
        `
        MATCH (a:HousingAnnouncement)
        WHERE a.subscptBgnde IS NOT NULL AND a.subscptEndde IS NOT NULL
          AND a.subscptBgnde <= $today AND a.subscptEndde >= $today
        OPTIONAL MATCH (a)-[:AVAILABLE_IN]->(r:Region)
        WITH a, collect(DISTINCT r.name) AS regionNames, collect(DISTINCT r.code) AS regionCodes
        WHERE $sidoCode = '' OR $sidoCode IN regionCodes
        RETURN a, regionNames
        ORDER BY a.subscptEndde ASC
        LIMIT 15
        `,
        { today, sidoCode },
      );
      const docs = result.records.map((record) => {
        const a = record.get('a').properties as Record<string, string>;
        const regionNames = (record.get('regionNames') as string[]).filter(Boolean);
        return {
          pageContent: [
            `[공고명] ${a.name}`,
            regionNames.length ? `[지역] ${regionNames.join(', ')}` : '',
            `[청약기간] ${a.subscptBgnde} ~ ${a.subscptEndde}`,
            `[공급유형] ${a.suplyTyNm || ''}`,
            `[세대수] ${a.suplyHoCo || ''}세대`,
            a.winnerDate ? `[당첨발표] ${a.winnerDate}` : '',
            `[신청링크] ${a.pcUrl || 'https://www.applyhome.co.kr'}`,
          ]
            .filter(Boolean)
            .join('\n'),
          metadata: { policyId: a.id, source: 'housing_announcement', score: 0.95 },
        };
      });
      if (traceId) {
        this.ragTrace.recordGraphWalk(traceId, {
          title: 'Neo4j 마감 임박 공고 탐색',
          detail: `${docs.length}개의 접수 중 공고를 찾았습니다.`,
          nodes: result.records.flatMap((record) => {
            const announcement = record.get('a').properties as Record<string, string>;
            const regions = (record.get('regionNames') as string[]).filter(Boolean);
            return [
              {
                id: policyNodeId(String(announcement.id)),
                label: announcement.name,
                kind: 'HousingAnnouncement',
              },
              ...regions.map((region) => ({
                id: `region:${region}`,
                label: region,
                kind: 'Region',
              })),
            ];
          }),
          edges: result.records.flatMap((record) => {
            const announcement = record.get('a').properties as Record<string, string>;
            return ((record.get('regionNames') as string[]) ?? [])
              .filter(Boolean)
              .map((region) => ({
                id: `${policyNodeId(String(announcement.id))}->region:${region}:AVAILABLE_IN`,
                source: policyNodeId(String(announcement.id)),
                target: `region:${region}`,
                label: 'AVAILABLE_IN',
              }));
          }),
        });
      }
      return docs;
    } catch (err) {
      this.logger.error('마감 임박 청약 조회 오류:', err);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Neo4j 그래프에서 추가 인사이트 추출
   * - 정책별 대상 생애주기, 지원 대상, 테마, 제공 지역
   * - 연관 테마를 공유하는 다른 정책 추천
   */
  async enrichWithGraphData(policyIds: string[], traceId?: string): Promise<string> {
    const validIds = policyIds.filter((id) => !id.startsWith('facility_') && !id.startsWith('housing_'));
    if (validIds.length === 0) return '';

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
          { policyIds: validIds },
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
          { policyIds: validIds },
        ),
      ]);

      const lines: string[] = [];
      const traceNodes: RagTraceNode[] = [];
      const traceEdges: RagTraceEdge[] = [];
      for (const record of detailRes.records) {
        const id = record.get('id') as string;
        const name = record.get('name') as string;
        const lifeStages = (record.get('lifeStages') as string[]).filter(Boolean);
        const targetGroups = (record.get('targetGroups') as string[]).filter(Boolean);
        const themes = (record.get('themes') as string[]).filter(Boolean);
        const regions = (record.get('regions') as string[]).filter(Boolean);

        traceNodes.push({ id: policyNodeId(id), label: name, kind: 'Policy' });
        for (const value of lifeStages) {
          traceNodes.push({ id: `lifeStage:${value}`, label: value, kind: 'LifeStage' });
          traceEdges.push({
            id: `${policyNodeId(id)}->lifeStage:${value}:TARGETS_LIFE_STAGE`,
            source: policyNodeId(id),
            target: `lifeStage:${value}`,
            label: 'TARGETS_LIFE_STAGE',
          });
        }
        for (const value of targetGroups) {
          traceNodes.push({ id: `targetGroup:${value}`, label: value, kind: 'TargetGroup' });
          traceEdges.push({
            id: `${policyNodeId(id)}->targetGroup:${value}:TARGETS_GROUP`,
            source: policyNodeId(id),
            target: `targetGroup:${value}`,
            label: 'TARGETS_GROUP',
          });
        }
        for (const value of themes) {
          traceNodes.push({ id: `theme:${value}`, label: value, kind: 'Theme' });
          traceEdges.push({
            id: `${policyNodeId(id)}->theme:${value}:HAS_THEME`,
            source: policyNodeId(id),
            target: `theme:${value}`,
            label: 'HAS_THEME',
          });
        }
        for (const value of regions) {
          traceNodes.push({ id: `region:${value}`, label: value, kind: 'Region' });
          traceEdges.push({
            id: `${policyNodeId(id)}->region:${value}:AVAILABLE_IN`,
            source: policyNodeId(id),
            target: `region:${value}`,
            label: 'AVAILABLE_IN',
          });
        }

        if (lifeStages.length || targetGroups.length || themes.length || regions.length) {
          lines.push(`[${name}]`);
          if (lifeStages.length) lines.push(`  - 대상 생애주기: ${lifeStages.join(', ')}`);
          if (targetGroups.length) lines.push(`  - 지원 대상 그룹: ${targetGroups.join(', ')}`);
          if (themes.length) lines.push(`  - 관련 주제: ${themes.join(', ')}`);
          if (regions.length) lines.push(`  - 제공 지역: ${regions.length > 5 ? regions.slice(0, 5).join(', ') + ' 외' : regions.join(', ')}`);
        }
      }

      const relatedNames = relatedRes.records.map((r) => r.get('name') as string).filter(Boolean);
      if (relatedNames.length) {
        lines.push('');
        lines.push(`[연관 정책]: ${relatedNames.join(', ')}`);
      }

      if (traceId) {
        this.ragTrace.recordGraphWalk(traceId, {
          title: 'Neo4j 정책 관계 확장',
          detail: `${detailRes.records.length}개 정책 노드에서 생애주기·대상·주제·지역 관계를 펼쳤습니다.`,
          nodes: traceNodes,
          edges: traceEdges,
          payload: { relatedPolicies: relatedNames },
        });
      }

      return lines.join('\n');
    } catch {
      return '';
    } finally {
      await session.close();
    }
  }

  private async saveAssistantMessage(
    sessionId: string,
    role: string,
    content: string,
  ): Promise<void> {
    if (role === 'assistant' && !this.chatRuntime.isSessionOpen(sessionId)) {
      return;
    }

    await this.persistMessage(sessionId, role, content);
  }

  private async saveUserMessage(sessionId: string, content: string): Promise<void> {
    await this.persistMessage(sessionId, 'user', content, content.slice(0, 60).trim());
  }

  private async persistMessage(
    sessionId: string,
    role: 'user' | 'assistant' | string,
    content: string,
    nextTitle?: string,
  ): Promise<void> {
    await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        session: { id: sessionId } as ChatSession,
        role,
        content,
      }),
    );

    await this.sessionRepo.query(
      `
      UPDATE chat_sessions
      SET "updatedAt" = NOW(),
          title = CASE
            WHEN $1::text IS NOT NULL AND (title IS NULL OR title = '' OR title = '새 대화')
              THEN $1
            ELSE title
          END
      WHERE id = $2
      `,
      [nextTitle ?? null, sessionId],
    );
  }

  private async ensureSessionOwnership(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
      select: ['id'],
    });
    if (!session) {
      throw new Error('대화를 찾을 수 없습니다.');
    }
  }

  private traceVectorSearch(
    traceId: string | undefined,
    title: string,
    query: string,
    results: Array<{ id?: string | number; score?: number | null; payload?: Record<string, unknown> | null }>,
    filter?: unknown,
  ) {
    if (!traceId) return;

    this.ragTrace.recordVectorSearch(traceId, {
      title,
      query,
      filter,
      hits: results.map((result, index) => {
        const payload = result.payload ?? {};
        const source = typeof payload.source === 'string' ? payload.source : null;
        const policyId = extractPolicyIdFromPayload(payload, index);
        return {
          id: policyNodeId(policyId),
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

/* ─── 헬퍼 함수 (서비스 외부, 순수 함수) ─── */

function ageToLifeStage(age: number): string {
  if (age <= 5) return '영유아';
  if (age <= 12) return '아동';
  if (age <= 18) return '청소년';
  if (age <= 34) return '청년';
  if (age <= 64) return '중장년';
  return '노년';
}

function profileToTargetGroups(profile: UserProfileType): string[] {
  const groups: string[] = [];
  if ((profile.incomeBracket ?? 200) <= 50) groups.push('저소득');
  if (profile.householdType === 'SINGLE_PARENT' || profile.isSingleParent) groups.push('한부모·조손');
  if (profile.isDisabled) groups.push('장애인');
  if (profile.hasChildren && (profile.childrenCount ?? 0) >= 3) groups.push('다자녀');
  if (profile.isVeteran) groups.push('보훈대상자');
  return groups;
}

function buildProfileText(profile: UserProfileType, age: number): string {
  const parts: string[] = [
    `${age}세`,
    profile.sidoCode ? getSidoName(profile.sidoCode) + ' 거주' : '',
    profile.householdType === 'SINGLE' ? '1인 가구' :
      profile.householdType === 'SINGLE_PARENT' ? '한부모가정' :
      profile.householdType === 'COUPLE' ? '부부 가구' : '가족 가구',
    profile.occupationType === 'UNEMPLOYED' ? '구직 중' :
      profile.occupationType === 'STUDENT' ? '학생' :
      profile.occupationType === 'EMPLOYEE' ? '직장인' :
      profile.occupationType ?? '',
    `중위소득 ${profile.incomeBracket ?? 100}% 이하`,
    profile.isHomeowner ? '자가 보유' : '무주택',
    profile.isDisabled ? '장애인' : '',
    profile.isVeteran ? '국가보훈대상자' : '',
    profile.hasChildren ? `자녀 ${profile.childrenCount ?? 1}명` : '',
  ].filter(Boolean);
  return parts.join(' ') + ' 복지 지원 정책 혜택';
}

function extractPolicyName(text: string): string | null {
  // Qdrant content 형식: "[정책명] 이름" 또는 "정책명: 이름"
  const patterns = [
    /\[정책명\]\s*(.+)/,
    /\[서비스명\]\s*(.+)/,
    /\[시설명\]\s*(.+)/,
    /\[단지명\]\s*(.+)/,
    /\[공고명\]\s*(.+)/,
    /정책명[:：]\s*(.+)/,
    /서비스명[:：]\s*(.+)/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1]) return m[1].trim().split('\n')[0].trim();
  }
  return null;
}

function policyNodeId(value: string) {
  return `entity:${value}`;
}

function extractPolicyIdFromPayload(payload: Record<string, unknown>, index: number) {
  const raw =
    payload.policyId ??
    payload.id ??
    payload.announcementId ??
    payload.facilityId ??
    payload.complexId;

  return typeof raw === 'string' && raw.length > 0 ? raw : `vector-hit-${index}`;
}

function extractTraceLabel(payload: Record<string, unknown>, index: number) {
  const nameCandidate = [payload.name, payload.title, payload.policyName, payload.facilityName]
    .find((value) => typeof value === 'string' && value.trim().length > 0);

  if (typeof nameCandidate === 'string') {
    return nameCandidate.trim();
  }

  const contentCandidate =
    (typeof payload.content === 'string' && payload.content) ||
    (typeof payload.text === 'string' && payload.text) ||
    '';
  const extracted = extractPolicyName(contentCandidate);
  if (extracted) return extracted;

  return `문서 ${index + 1}`;
}

function mapTraceKind(source: string | null) {
  switch (source) {
    case 'bokjiro':
    case 'local_bokjiro':
    case 'youth_center':
      return 'Policy';
    case 'welfare_facility':
      return 'WelfareFacility';
    case 'lh_housing':
    case 'housing_complex':
      return 'HousingComplex';
    case 'housing_announcement':
    case 'applyhome':
    case 'myhome_announcement':
    case 'applyhome_cmpet':
    case 'applyhome_stat':
      return 'HousingAnnouncement';
    default:
      return 'Document';
  }
}

const QUESTION_TEMPLATES = [
  (name: string) => `${name} 신청 방법 알려줘`,
  (name: string) => `${name} 받을 수 있는 조건이 어떻게 되나요?`,
  (name: string) => `${name} 지원 신청하려면 어떻게 해야 하나요?`,
  (name: string) => `${name}에 대해 자세히 알려줘`,
];

function buildSuggestions(policyNames: string[], profile: UserProfileType, age: number): string[] {
  const set = new Set<string>();

  // 프로필 특성 기반 고정 질문
  if (!profile.isHomeowner) set.add('무주택자 공공임대주택 신청 방법 알려줘');
  if (age >= 19 && age <= 34) set.add('청년 월세 보조금 신청 조건이 어떻게 되나요?');
  if (age >= 65) set.add('기초연금 신청 방법과 지급액 알려줘');
  if ((profile.incomeBracket ?? 200) <= 50) set.add('차상위계층 지원 혜택 전부 알려줘');
  if (profile.isDisabled) set.add('장애인 활동지원서비스 신청 방법 알려줘');
  if (profile.hasChildren) set.add('아이돌봄 서비스 신청 자격과 방법 알려줘');
  if (profile.occupationType === 'UNEMPLOYED') set.add('실업급여 신청 조건과 방법 알려줘');
  if (profile.isSingleParent || profile.householdType === 'SINGLE_PARENT') set.add('한부모가정 양육비 지원 받을 수 있나요?');
  if (profile.isVeteran) set.add('국가보훈대상자 의료비 지원 알려줘');
  if (age >= 35 && age <= 55 && profile.occupationType === 'UNEMPLOYED') set.add('중장년 재취업 지원 프로그램 알려줘');

  // Qdrant + Neo4j 정책명 → 질문 생성
  policyNames.slice(0, 4).forEach((name, i) => {
    set.add(QUESTION_TEMPLATES[i % QUESTION_TEMPLATES.length](name));
  });

  // 공통 마지막 질문
  set.add('내 조건에 맞는 복지 혜택 전체 목록 보여줘');

  return Array.from(set).slice(0, 6);
}

const DEFAULT_SUGGESTIONS = [
  '청년 월세 보조금 신청 방법 알려줘',
  '저소득층 의료비 지원 정책이 있나요?',
  '무주택자 공공임대주택 신청 방법 알려줘',
  '실업급여 신청 조건과 방법 알려줘',
  '기초연금 신청 방법과 지급액 알려줘',
  '내 조건에 맞는 복지 혜택 전체 목록 보여줘',
];
