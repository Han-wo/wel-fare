/**
 * 중앙부처 복지서비스 공공API → Qdrant + Neo4j 적재 시더
 *
 * 실행: ts-node --transpile-only src/database/seeds/welfare-api.seed.ts
 */
import axios from 'axios';
import './http-agent'; // axios keepAlive 글로벌 적용
import * as xml2js from 'xml2js';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';
import { ensureNeo4jConstraints } from './neo4j-constraints';
import { createHash } from 'node:crypto';
import { getRequiredAnyEnv, getRequiredEnv } from '../../common/env.util';
import {
  buildIncrementalSyncPlan,
  makeSyncHash,
  type PreparedSyncItem,
} from './incremental-sync.util';
import {
  closePolicySyncDataSource,
  syncPoliciesToPostgres,
  type RelationalPolicyUpsertInput,
} from './policy-relational-sync.util';

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = getRequiredAnyEnv([
  'BOKJIRO_API_KEY',
  'PUBLIC_DATA_API_KEY',
]);
const WELFARE_BASE_URL =
  'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001';
const PAGE_SIZE = 100;
const EMBED_BATCH = 100; // 한 번에 임베딩할 정책 수
const QDRANT_LOOKUP_BATCH = 50;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    getRequiredEnv('NEO4J_PASSWORD'),
  ),
);
const openai = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });

// ── 타입 ─────────────────────────────────────────────────
interface PolicyListItem {
  servId: string;
  servNm: string;
  jurMnofNm: string;
  jurOrgNm?: string;
  servDgst: string;
  lifeArray?: string;
  trgterIndvdlArray?: string;
  intrsThemaArray?: string;
  onapPsbltYn?: string;
  sprtCycNm?: string;
  srvPvsnNm?: string;
}

interface PolicyDetail extends PolicyListItem {
  tgtrDtlCn?: string;   // 대상자 상세
  slctCritCn?: string;  // 선정기준
  alwServCn?: string;   // 지원서비스 내용
  wlfareInfoOutlCn?: string; // 복지서비스 개요
  crtrYr?: string;      // 기준연도
}

type PreparedPolicy = PreparedSyncItem<PolicyDetail>;

// ── 유틸 ─────────────────────────────────────────────────
function servIdToPointId(servId: string): string {
  const hex = createHash('sha1').update(`bokjiro:${servId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function cleanText(text?: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

function splitValues(value?: string) {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function buildPageContent(p: PolicyDetail): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${p.servNm}`);
  parts.push(`[주관부처] ${p.jurMnofNm}${p.jurOrgNm ? ' ' + p.jurOrgNm : ''}`);
  if (p.wlfareInfoOutlCn || p.servDgst)
    parts.push(`[개요] ${cleanText(p.wlfareInfoOutlCn || p.servDgst)}`);
  if (p.lifeArray) parts.push(`[생애주기] ${p.lifeArray}`);
  if (p.trgterIndvdlArray) parts.push(`[대상자] ${p.trgterIndvdlArray}`);
  if (p.intrsThemaArray) parts.push(`[주제] ${p.intrsThemaArray}`);
  if (p.tgtrDtlCn) parts.push(`[대상자 상세]\n${cleanText(p.tgtrDtlCn)}`);
  if (p.slctCritCn) parts.push(`[선정기준]\n${cleanText(p.slctCritCn)}`);
  if (p.alwServCn) parts.push(`[지원내용]\n${cleanText(p.alwServCn)}`);
  if (p.sprtCycNm) parts.push(`[지원주기] ${p.sprtCycNm}`);
  if (p.srvPvsnNm) parts.push(`[제공유형] ${p.srvPvsnNm}`);
  if (p.onapPsbltYn === 'Y') parts.push(`[온라인신청] 가능`);
  parts.push(`[신청링크] https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`);
  return parts.join('\n');
}

async function removeStaleQdrantPoints(policies: PreparedPolicy[]): Promise<number> {
  if (policies.length === 0) return 0;

  const desiredPointIds = new Map(
    policies.map(({ item, policyId }) => [policyId, servIdToPointId(item.servId)]),
  );
  const stalePointIds = new Map<string, number | string>();
  const policyIds = [...desiredPointIds.keys()];

  for (let i = 0; i < policyIds.length; i += QDRANT_LOOKUP_BATCH) {
    const policyIdBatch = policyIds.slice(i, i + QDRANT_LOOKUP_BATCH);
    let offset: number | string | undefined;

    while (true) {
      const response = await qdrant.scroll(COLLECTION, {
        limit: Math.max(policyIdBatch.length * 4, 100),
        offset,
        with_payload: ['policyId', 'source'],
        with_vector: false,
        filter: {
          must: [{ key: 'source', match: { value: 'bokjiro' } }],
          should: policyIdBatch.map((policyId) => ({
            key: 'policyId',
            match: { value: policyId },
          })),
        },
      });

      for (const point of response.points) {
        const policyId = String(point.payload?.policyId ?? '');
        const expectedPointId = desiredPointIds.get(policyId);
        if (!expectedPointId) continue;
        if (String(point.id) !== expectedPointId) {
          stalePointIds.set(String(point.id), point.id as number | string);
        }
      }

      if (!response.next_page_offset) break;
      offset = response.next_page_offset as number | string;
    }
  }

  if (stalePointIds.size === 0) return 0;

  await qdrant.delete(COLLECTION, {
    wait: true,
    points: [...stalePointIds.values()],
  });

  return stalePointIds.size;
}

// ── API 호출 ─────────────────────────────────────────────
async function parseXml(xml: string): Promise<Record<string, unknown>> {
  return xml2js.parseStringPromise(xml, { explicitArray: false, trim: true });
}

async function fetchList(pageNo: number): Promise<{ total: number; items: PolicyListItem[] }> {
  const { data } = await axios.get(`${WELFARE_BASE_URL}/NationalWelfarelistV001`, {
    params: { serviceKey: API_KEY, numOfRows: PAGE_SIZE, pageNo, srchKeyCode: '003' },
  });
  const parsed = await parseXml(data);
  const root = parsed.wantedList as Record<string, unknown>;
  const total = parseInt(root.totalCount as string, 10);
  const rawItems = root.servList;
  if (!rawItems) return { total, items: [] };
  const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
  return {
    total,
    items: arr.map((i: Record<string, string>) => ({
      servId: i.servId,
      servNm: i.servNm,
      jurMnofNm: i.jurMnofNm,
      jurOrgNm: i.jurOrgNm,
      servDgst: i.servDgst,
      lifeArray: i.lifeArray,
      trgterIndvdlArray: i.trgterIndvdlArray,
      intrsThemaArray: i.intrsThemaArray,
      onapPsbltYn: i.onapPsbltYn,
      sprtCycNm: i.sprtCycNm,
      srvPvsnNm: i.srvPvsnNm,
    })),
  };
}

async function fetchDetail(servId: string): Promise<Partial<PolicyDetail>> {
  try {
    const { data } = await axios.get(`${WELFARE_BASE_URL}/NationalWelfaredetailedV001`, {
      params: { serviceKey: API_KEY, servId },
      timeout: 10000,
    });
    const parsed = await parseXml(data);
    const d = parsed.wantedDtl as Record<string, string>;
    return {
      tgtrDtlCn: d.tgtrDtlCn,
      slctCritCn: d.slctCritCn,
      alwServCn: d.alwServCn,
      wlfareInfoOutlCn: d.wlfareInfoOutlCn,
      crtrYr: d.crtrYr,
    };
  } catch {
    return {};
  }
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function preparePolicies(policies: PolicyDetail[]): PreparedPolicy[] {
  return policies.map((policy) => {
    const policyId = policy.servId;
    const content = buildPageContent(policy);
    return {
      item: policy,
      policyId,
      graphId: policyId,
      content,
      syncHash: makeSyncHash({
        policyId,
        content,
        onlineApply: policy.onapPsbltYn,
        supportCycle: policy.sprtCycNm,
        provisionType: policy.srvPvsnNm,
        targetGroup: policy.trgterIndvdlArray,
      }),
    };
  });
}

function toRelationalPolicyInput(policy: PolicyDetail): RelationalPolicyUpsertInput {
  const tags = [
    ...splitValues(policy.lifeArray),
    ...splitValues(policy.trgterIndvdlArray),
    ...splitValues(policy.intrsThemaArray),
  ];

  const requirements = [
    policy.tgtrDtlCn
      ? {
          reqType: 'TARGET_DETAIL',
          description: cleanText(policy.tgtrDtlCn),
        }
      : null,
    policy.slctCritCn
      ? {
          reqType: 'SELECTION_CRITERIA',
          description: cleanText(policy.slctCritCn),
        }
      : null,
  ].filter(Boolean) as RelationalPolicyUpsertInput['requirements'];

  return {
    externalId: `bokjiro:${policy.servId}`,
    source: 'bokjiro',
    name: policy.servNm,
    category: splitValues(policy.intrsThemaArray)[0] ?? '복지서비스',
    subcategory: splitValues(policy.intrsThemaArray).slice(1).join(' · ') || null,
    provider: [policy.jurMnofNm, policy.jurOrgNm].filter(Boolean).join(' / ') || null,
    summary: cleanText(policy.wlfareInfoOutlCn || policy.servDgst),
    content: buildPageContent(policy),
    targetSummary: cleanText(policy.tgtrDtlCn || policy.trgterIndvdlArray),
    benefitType: policy.srvPvsnNm ?? null,
    status: 'ACTIVE',
    applyUrl: `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${policy.servId}`,
    sidoCodes: ['ALL'],
    tags,
    rawData: policy as unknown as Record<string, unknown>,
    qdrantPointId: servIdToPointId(policy.servId),
    neo4jNodeId: policy.servId,
    requirements,
  };
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(policies: PreparedPolicy[], embeddings: number[][]): Promise<void> {
  await removeStaleQdrantPoints(policies);

  const points = policies.map(({ item: p, policyId, content, syncHash }, i) => ({
    id: servIdToPointId(p.servId),
    vector: embeddings[i],
    payload: {
      policyId,
      policyName: p.servNm,
      category: p.intrsThemaArray ?? '',
      ministry: p.jurMnofNm,
      lifeStage: p.lifeArray ?? '',
      targetGroup: p.trgterIndvdlArray ?? '',
      onlineApply: p.onapPsbltYn === 'Y',
      supportCycle: p.sprtCycNm ?? '',
      provisionType: p.srvPvsnNm ?? '',
      content,
      applyUrl: `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`,
      status: 'active',
      source: 'bokjiro',
      syncHash,
    },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(policies: PreparedPolicy[]): Promise<void> {
  if (policies.length === 0) return;
  const rows = policies.map(({ item: p, syncHash }) => ({
    id: p.servId,
    name: p.servNm,
    ministry: p.jurMnofNm ?? '',
    summary: cleanText(p.servDgst),
    onlineApply: p.onapPsbltYn === 'Y',
    supportCycle: p.sprtCycNm ?? '',
    provisionType: p.srvPvsnNm ?? '',
    syncHash,
    lifeStages: splitValues(p.lifeArray),
    themes: splitValues(p.intrsThemaArray),
    targets: splitValues(p.trgterIndvdlArray),
  }));

  const session = neo4jDriver.session();
  try {
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (pol:Policy {id: row.id})
      SET pol.name = row.name,
          pol.ministry = row.ministry,
          pol.summary = row.summary,
          pol.onlineApply = row.onlineApply,
          pol.supportCycle = row.supportCycle,
          pol.provisionType = row.provisionType,
          pol.source = 'bokjiro',
          pol.syncHash = row.syncHash,
          pol.updatedAt = datetime()
      WITH pol, row
      FOREACH (stage IN row.lifeStages |
        MERGE (ls:LifeStage {name: stage})
        MERGE (pol)-[:TARGETS_LIFE_STAGE]->(ls)
      )
      FOREACH (theme IN row.themes |
        MERGE (th:Theme {name: theme})
        MERGE (pol)-[:HAS_THEME]->(th)
      )
      FOREACH (target IN row.targets |
        MERGE (tg:TargetGroup {name: target})
        MERGE (pol)-[:TARGETS_GROUP]->(tg)
      )
      `,
      { rows },
    );
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🚀 복지서비스 공공API 데이터 적재 시작');
  await ensureNeo4jConstraints(neo4jDriver);

  // 1. 전체 목록 수집
  console.log('📋 정책 목록 수집 중...');
  const allItems: PolicyListItem[] = [];
  const { total, items: firstPage } = await fetchList(1);
  allItems.push(...firstPage);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total}개 정책, ${totalPages} 페이지`);

  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchList(page);
    allItems.push(...items);
    process.stdout.write(`   페이지 ${page}/${totalPages}\r`);
  }
  console.log(`\n✅ 목록 수집 완료: ${allItems.length}개`);

  // 2. 상세 정보 수집 + 임베딩 + 저장 (배치)
  console.log('🔍 상세 조회 + 임베딩 + 저장 중...');
  let vectorUpdated = 0;
  let graphUpdated = 0;
  let skipped = 0;
  for (let i = 0; i < allItems.length; i += EMBED_BATCH) {
    const batch = allItems.slice(i, i + EMBED_BATCH);

    // 상세 조회
    const details = await Promise.all(
      batch.map(async (item) => {
        const detail = await fetchDetail(item.servId);
        return { ...item, ...detail } as PolicyDetail;
      }),
    );

    const prepared = preparePolicies(details);
    const plan = await buildIncrementalSyncPlan({
      client: qdrant,
      collectionName: COLLECTION,
      preparedItems: prepared,
      driver: neo4jDriver,
      graphLabel: 'Policy',
    });
    skipped += plan.skippedCount;
    const touchedPolicyIds = new Set([
      ...plan.vectorUpdates.map((item) => item.policyId),
      ...plan.graphUpdates.map((item) => item.policyId),
    ]);
    const relationalBatch = details
      .filter((item) => touchedPolicyIds.has(item.servId))
      .map((item) => toRelationalPolicyInput(item));

    const vectorPromise =
      plan.vectorUpdates.length > 0
        ? (async () => {
            const embeddings = await embedTexts(plan.vectorUpdates.map((item) => item.content));
            await upsertToQdrant(plan.vectorUpdates, embeddings);
            vectorUpdated += plan.vectorUpdates.length;
          })()
        : Promise.resolve();

    const graphPromise =
      plan.graphUpdates.length > 0
        ? (async () => {
            await upsertToNeo4j(plan.graphUpdates);
            graphUpdated += plan.graphUpdates.length;
          })()
        : Promise.resolve();

    await Promise.all([
      vectorPromise,
      graphPromise,
      syncPoliciesToPostgres(relationalBatch),
    ]);

    const done = Math.min(i + EMBED_BATCH, allItems.length);
    console.log(`   [${done}/${allItems.length}] 처리 완료`);
  }

  console.log(
    `🎉 모든 복지 정책 데이터 증분 적재 완료! (벡터 ${vectorUpdated}, 그래프 ${graphUpdated}, 스킵 ${skipped})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePolicySyncDataSource();
    await neo4jDriver.close();
  });
