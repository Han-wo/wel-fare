/**
 * 지자체 복지서비스 공공API → Qdrant + Neo4j 적재 시더
 *
 * 실행: ts-node --transpile-only src/database/seeds/local-welfare.seed.ts
 */
import axios from 'axios';
import * as xml2js from 'xml2js';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';
import { getRequiredAnyEnv, getRequiredEnv } from '../../common/env.util';
import {
  buildIncrementalSyncPlan,
  makeSyncHash,
  type PreparedSyncItem,
} from './incremental-sync.util';
import { getSidoCode } from '@welfare-ai/shared-utils';
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
const LOCAL_BASE_URL =
  'https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations';
const PAGE_SIZE = 100;
const EMBED_BATCH = 20;
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
interface LocalPolicyListItem {
  servId: string;
  servNm: string;
  ctpvNm: string;    // 시도명
  sggNm?: string;    // 시군구명
  bizChrDeptNm?: string; // 담당부서
  servDgst: string;
  lifeNmArray?: string;
  intrsThemaNmArray?: string;
  aplyMtdNm?: string;
  sprtCycNm?: string;
  srvPvsnNm?: string;
  lastModYmd?: string;
}

interface LocalPolicyDetail extends LocalPolicyListItem {
  sprtTrgtCn?: string;  // 지원대상
  slctCritCn?: string;  // 선정기준
  alwServCn?: string;   // 지원서비스 내용
  aplyMtdCn?: string;   // 신청방법
  enfcBgngYmd?: string; // 시행일
  enfcEndYmd?: string;  // 종료일
}

type PreparedLocalPolicy = PreparedSyncItem<LocalPolicyDetail>;

// ── 유틸 ─────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRequestError(error: unknown) {
  return axios.isAxiosError(error) && (error.response?.status === 429 || (error.response?.status ?? 0) >= 500);
}

async function withRetry<T>(task: () => Promise<T>, attempts = 4, baseDelayMs = 750): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableRequestError(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

function cleanText(text?: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

function splitValues(value?: string) {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function normalizeDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function buildPageContent(p: LocalPolicyDetail): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${p.servNm}`);
  parts.push(`[지역] ${p.ctpvNm}${p.sggNm && p.sggNm !== p.ctpvNm ? ' ' + p.sggNm : ''}`);
  if (p.bizChrDeptNm) parts.push(`[담당부서] ${p.bizChrDeptNm}`);
  if (p.servDgst) parts.push(`[개요] ${cleanText(p.servDgst)}`);
  if (p.lifeNmArray) parts.push(`[생애주기] ${p.lifeNmArray}`);
  if (p.intrsThemaNmArray) parts.push(`[주제] ${p.intrsThemaNmArray}`);
  if (p.sprtTrgtCn) parts.push(`[지원대상]\n${cleanText(p.sprtTrgtCn)}`);
  if (p.slctCritCn) parts.push(`[선정기준]\n${cleanText(p.slctCritCn)}`);
  if (p.alwServCn) parts.push(`[지원내용]\n${cleanText(p.alwServCn)}`);
  if (p.aplyMtdCn) parts.push(`[신청방법]\n${cleanText(p.aplyMtdCn)}`);
  if (p.sprtCycNm) parts.push(`[지원주기] ${p.sprtCycNm}`);
  if (p.srvPvsnNm) parts.push(`[제공유형] ${p.srvPvsnNm}`);
  if (p.aplyMtdNm) parts.push(`[신청방법] ${p.aplyMtdNm}`);
  parts.push(`[신청링크] https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`);
  return parts.join('\n');
}

// ── servId → 숫자 ID (Qdrant point id) ───────────────────
function servIdToNum(servId: string): number {
  let hash = 5381;
  for (let i = 0; i < servId.length; i++) {
    hash = ((hash << 5) + hash + servId.charCodeAt(i)) & 0x7fffffff;
  }
  // 중앙부처(welfare-api.seed)와 충돌 방지: offset 추가
  return (hash + 1_000_000_000) % 2_147_483_647;
}

// ── API 호출 ─────────────────────────────────────────────
async function parseXml(xml: string): Promise<Record<string, unknown>> {
  return xml2js.parseStringPromise(xml, { explicitArray: false, trim: true });
}

async function fetchList(pageNo: number): Promise<{ total: number; items: LocalPolicyListItem[] }> {
  const { data } = await withRetry(() =>
    axios.get(`${LOCAL_BASE_URL}/LcgvWelfarelist`, {
      params: { serviceKey: API_KEY, numOfRows: PAGE_SIZE, pageNo },
      responseType: 'text',
      timeout: 15000,
    }),
  );

  // 목록 API는 JSON 반환
  const root = JSON.parse(data) as Record<string, unknown>;
  const total = parseInt(root.totalCount as string, 10);
  const rawItems = root.servList as Record<string, string>[] | undefined;
  if (!rawItems) return { total, items: [] };
  const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
  return {
    total,
    items: arr.map((i) => ({
      servId: i.servId,
      servNm: i.servNm,
      ctpvNm: i.ctpvNm,
      sggNm: i.sggNm,
      bizChrDeptNm: i.bizChrDeptNm,
      servDgst: i.servDgst,
      lifeNmArray: i.lifeNmArray,
      intrsThemaNmArray: i.intrsThemaNmArray,
      aplyMtdNm: i.aplyMtdNm,
      sprtCycNm: i.sprtCycNm,
      srvPvsnNm: i.srvPvsnNm,
      lastModYmd: i.lastModYmd,
    })),
  };
}

async function fetchDetail(servId: string): Promise<Partial<LocalPolicyDetail>> {
  try {
    const { data } = await withRetry(() =>
      axios.get(`${LOCAL_BASE_URL}/LcgvWelfaredetailed`, {
        params: { serviceKey: API_KEY, servId },
        timeout: 10000,
      }),
    );
    const parsed = await parseXml(data);
    const d = parsed.wantedDtl as Record<string, string>;
    return {
      sprtTrgtCn: d.sprtTrgtCn,
      slctCritCn: d.slctCritCn,
      alwServCn: d.alwServCn,
      aplyMtdCn: d.aplyMtdCn,
      enfcBgngYmd: d.enfcBgngYmd,
      enfcEndYmd: d.enfcEndYmd,
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

function preparePolicies(policies: LocalPolicyDetail[]): PreparedLocalPolicy[] {
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
        region: policy.ctpvNm,
        sigungu: policy.sggNm,
        ministry: policy.bizChrDeptNm,
        sourceUpdatedAt: policy.lastModYmd ?? '',
      }),
    };
  });
}

function toRelationalPolicyInput(policy: LocalPolicyDetail): RelationalPolicyUpsertInput {
  const tags = [...splitValues(policy.lifeNmArray), ...splitValues(policy.intrsThemaNmArray)];
  const requirements = [
    policy.sprtTrgtCn
      ? {
          reqType: 'TARGET_DETAIL',
          description: cleanText(policy.sprtTrgtCn),
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
    externalId: `local_bokjiro:${policy.servId}`,
    source: 'local_bokjiro',
    name: policy.servNm,
    category: splitValues(policy.intrsThemaNmArray)[0] ?? '지자체 복지서비스',
    subcategory: splitValues(policy.intrsThemaNmArray).slice(1).join(' · ') || null,
    provider: policy.bizChrDeptNm ?? null,
    summary: cleanText(policy.servDgst),
    content: buildPageContent(policy),
    targetSummary: cleanText(policy.sprtTrgtCn),
    benefitType: policy.srvPvsnNm ?? null,
    applicationStart: normalizeDate(policy.enfcBgngYmd),
    applicationEnd: normalizeDate(policy.enfcEndYmd),
    status: 'ACTIVE',
    applyUrl: `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${policy.servId}`,
    sidoCodes: [getSidoCode(policy.ctpvNm) ?? null].filter(Boolean) as string[],
    tags,
    rawData: policy as unknown as Record<string, unknown>,
    qdrantPointId: String(servIdToNum(policy.servId)),
    neo4jNodeId: policy.servId,
    requirements,
  };
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(
  policies: PreparedLocalPolicy[],
  embeddings: number[][],
): Promise<void> {
  const points = policies.map(({ item: p, policyId, content, syncHash }, i) => ({
    id: servIdToNum(p.servId),
    vector: embeddings[i],
    payload: {
      policyId,
      policyName: p.servNm,
      category: p.intrsThemaNmArray ?? '',
      region: p.ctpvNm,
      sigungu: p.sggNm ?? '',
      ministry: p.bizChrDeptNm ?? '',
      lifeStage: p.lifeNmArray ?? '',
      onlineApply: (p.aplyMtdNm ?? '').includes('인터넷') || (p.aplyMtdNm ?? '').includes('모바일'),
      supportCycle: p.sprtCycNm ?? '',
      provisionType: p.srvPvsnNm ?? '',
      content,
      applyUrl: `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`,
      status: 'active',
      source: 'local_bokjiro',
      syncHash,
    },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(policies: PreparedLocalPolicy[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const { item: p, syncHash } of policies) {
      await session.run(
        `
        MERGE (pol:Policy {id: $id})
        SET pol.name = $name,
            pol.region = $region,
            pol.sigungu = $sigungu,
            pol.ministry = $ministry,
            pol.summary = $summary,
            pol.supportCycle = $supportCycle,
            pol.provisionType = $provisionType,
            pol.source = 'local_bokjiro', pol.syncHash = $syncHash,
            pol.updatedAt = datetime()
        `,
        {
          id: p.servId,
          name: p.servNm,
          region: p.ctpvNm,
          sigungu: p.sggNm ?? '',
          ministry: p.bizChrDeptNm ?? '',
          summary: cleanText(p.servDgst),
          supportCycle: p.sprtCycNm ?? '',
          provisionType: p.srvPvsnNm ?? '',
          syncHash,
        },
      );

      // 지역 관계
      await session.run(
        `
        MERGE (r:Region {name: $region})
        WITH r
        MATCH (pol:Policy {id: $id})
        MERGE (pol)-[:AVAILABLE_IN]->(r)
        `,
        { region: p.ctpvNm, id: p.servId },
      );

      // 생애주기 관계
      if (p.lifeNmArray) {
        for (const stage of p.lifeNmArray.split(',').map((s) => s.trim()).filter(Boolean)) {
          await session.run(
            `MERGE (ls:LifeStage {name: $name}) WITH ls MATCH (pol:Policy {id: $id}) MERGE (pol)-[:TARGETS_LIFE_STAGE]->(ls)`,
            { name: stage, id: p.servId },
          );
        }
      }

      // 주제 관계
      if (p.intrsThemaNmArray) {
        for (const theme of p.intrsThemaNmArray.split(',').map((s) => s.trim()).filter(Boolean)) {
          await session.run(
            `MERGE (th:Theme {name: $name}) WITH th MATCH (pol:Policy {id: $id}) MERGE (pol)-[:HAS_THEME]->(th)`,
            { name: theme, id: p.servId },
          );
        }
      }
    }
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🚀 지자체 복지서비스 공공API 데이터 적재 시작');

  console.log('📋 정책 목록 수집 중...');
  const allItems: LocalPolicyListItem[] = [];
  const { total, items: firstPage } = await fetchList(1);
  allItems.push(...firstPage);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total}개 지자체 정책, ${totalPages} 페이지`);

  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchList(page);
    allItems.push(...items);
    process.stdout.write(`   페이지 ${page}/${totalPages}\r`);
    await sleep(120);
  }
  console.log(`\n✅ 목록 수집 완료: ${allItems.length}개`);

  console.log('🔍 상세 조회 + 임베딩 + 저장 중...');
  let vectorUpdated = 0;
  let graphUpdated = 0;
  let skipped = 0;
  for (let i = 0; i < allItems.length; i += EMBED_BATCH) {
    const batch = allItems.slice(i, i + EMBED_BATCH);

    const details = await Promise.all(
      batch.map(async (item) => {
        const detail = await fetchDetail(item.servId);
        return { ...item, ...detail } as LocalPolicyDetail;
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
    const relationalBatch = details.map((item) => toRelationalPolicyInput(item));

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
    process.stdout.write(`   [${done}/${allItems.length}] 처리 완료\r`);
  }

  console.log(
    `\n🎉 지자체 복지 정책 증분 적재 완료! (벡터 ${vectorUpdated}, 그래프 ${graphUpdated}, 스킵 ${skipped})`,
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
