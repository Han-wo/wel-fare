import { Injectable, Inject, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(RagService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly qdrantClient: QdrantClient;
  private readonly ragGraph: ReturnType<typeof createRagGraph>;
  // 추천 질문 캐시: userId → { data, expiresAt } (5분 TTL)
  private readonly suggestionsCache = new Map<string, { data: string[]; expiresAt: number }>();

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
      enrichWithGraph: traceable(this.enrichWithGraphData.bind(this), {
        name: 'neo4j_graph_enrich',
        run_type: 'retriever',
        tags: ['neo4j', 'graph', 'cypher'],
      }),
      searchHousing: this.searchHousingData.bind(this),
      loadHistory: this.loadChatHistory.bind(this),
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
          chatHistory: [],
          candidatePolicyIds: [],
          documents: [],
          filteredDocuments: [],
          graphContext: '',
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
      .catch((err) => {
        this.logger.error('RAG 파이프라인 오류:', err);
        tokens.push(`\n\n⚠️ 오류가 발생했습니다: ${(err as Error).message}`);
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
        RETURN p.id AS policyId
        LIMIT 50
        `,
        {
          lifeStage,
          sidoCode: profile.sidoCode ?? '',
          targetGroups: targetGroups.length > 0 ? targetGroups : ['__none__'],
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

    // Qdrant = 순수 semantic search. 구조화 필터(지역·날짜)는 Neo4j에서 처리.
    const searchResult = await this.qdrantClient.search(collectionName, {
      vector: queryVector,
      limit: 8,
      filter:
        policyIds.length > 0
          ? { must: [{ key: 'policyId', match: { any: policyIds } }] }
          : undefined,
      with_payload: true,
      score_threshold: 0.4,
    });

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
    const collectionName = this.config.get('QDRANT_COLLECTION', 'welfare_policies');

    const [qdrantResults, neo4jPolicyNames] = await Promise.all([
      this.qdrantClient
        .search(collectionName, { vector: queryVector, limit: 8, with_payload: true, score_threshold: 0.45 })
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
   * 청약·임대·주택 관련 질문 → Neo4j 그래프에서 구조화 조회
   * (날짜·지역 필터는 그래프에서 처리, Qdrant는 semantic search 전용)
   */
  async searchHousingData(question: string, sidoCode: string): Promise<Document[]> {
    const isHousingQuery = /청약|임대|주택|입주|분양|행복주택|국민임대|매입임대|전세임대|공공주택|LH|SH/.test(question);
    if (!isHousingQuery) return [];

    const docs: Document[] = [];

    // ── 세션 1: HousingAnnouncement 조회 ─────────────────────
    // EXISTS {} 대신 collect() → WHERE IN 패턴으로 Neo4j 호환성 확보
    const session1 = this.neo4jDriver.session();
    try {
      const annoRes = await session1.run(
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
        const lines = [
          `[정책명] ${a.name}`,
          `[유형] ${a.suplyTyNm || '청약'} (${a.houseTyNm || '공고 참조'})`,
          regionNames.length ? `[청약지역] ${regionNames.join(', ')}` : '',
          `[공급세대수] ${a.suplyHoCo || ''}세대`,
          `[주소] ${a.address || ''}`,
          a.annoDate ? `[모집공고일] ${a.annoDate}` : '',
          a.subscptBgnde ? `[청약접수] ${a.subscptBgnde} ~ ${a.subscptEndde || ''}` : '',
          a.winnerDate ? `[당첨자발표] ${a.winnerDate}` : '',
          a.moveInYM ? `[입주예정] ${a.moveInYM}` : '',
          `[시행기관] ${a.insttNm || ''}`,
          `[신청링크] ${a.pcUrl || 'https://www.applyhome.co.kr'}`,
        ].filter(Boolean);
        docs.push({
          pageContent: lines.join('\n'),
          metadata: { policyId: a.id, source: 'housing_announcement', score: 0.9 },
        });
      }
      this.logger.log(`청약공고 조회: ${annoRes.records.length}건 (sidoCode=${sidoCode})`);
    } catch (err) {
      this.logger.error('청약공고 Neo4j 조회 오류:', err);
    } finally {
      await session1.close();
    }

    // ── 세션 2: HousingComplex 조회 ──────────────────────────
    const session2 = this.neo4jDriver.session();
    try {
      const complexRes = await session2.run(
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
            `[정책명] ${rName} ${h.sigungu || ''} 공공임대주택`,
            `[유형] 공공임대주택 단지`,
            `[주소] ${h.address || ''}`,
            `[세대수] ${h.hshldCo || ''}세대`,
            `[관리기관] ${h.manager || ''}`,
            `[신청링크] https://www.lh.or.kr`,
          ].join('\n'),
          metadata: { policyId: h.id, source: 'housing_complex', score: 0.85 },
        });
      }
    } catch (err) {
      this.logger.error('주택단지 Neo4j 조회 오류:', err);
    } finally {
      await session2.close();
    }

    return docs;
  }

  /**
   * Neo4j 그래프에서 추가 인사이트 추출
   * - 정책별 대상 생애주기, 지원 대상, 테마, 제공 지역
   * - 연관 테마를 공유하는 다른 정책 추천
   */
  async enrichWithGraphData(policyIds: string[]): Promise<string> {
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
          if (regions.length) lines.push(`  - 제공 지역: ${regions.length > 5 ? regions.slice(0, 5).join(', ') + ' 외' : regions.join(', ')}`);
        }
      }

      const relatedNames = relatedRes.records.map((r) => r.get('name') as string).filter(Boolean);
      if (relatedNames.length) {
        lines.push('');
        lines.push(`[연관 정책]: ${relatedNames.join(', ')}`);
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
    await this.messageRepo.save(this.messageRepo.create({ sessionId, role, content }));
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
