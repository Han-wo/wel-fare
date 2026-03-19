/**
 * 한국사회보장정보원 사회복지시설정보 → Qdrant + Neo4j 적재 시더
 *
 * 실행: ts-node --transpile-only src/database/seeds/welfare-facility.seed.ts
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

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = getRequiredAnyEnv([
  'BOKJIRO_API_KEY',
  'PUBLIC_DATA_API_KEY',
]);
const BASE_URL = 'https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1';
const PAGE_SIZE = 100;
const EMBED_BATCH = 20;
const EMBED_CONCURRENCY = 5; // 동시에 처리할 배치 수
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    getRequiredEnv('NEO4J_PASSWORD'),
  ),
);
const openai = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });

// ── 타입 ─────────────────────────────────────────────────
interface FacilityItem {
  fcltCd: string;
  fcltKindCd: string;
  fcltKindNm: string;
  fcltNm: string;
  fcltStatus: string;
}

type PreparedFacility = PreparedSyncItem<FacilityItem>;

// ── 유틸 ─────────────────────────────────────────────────
function buildPageContent(f: FacilityItem): string {
  const status = f.fcltStatus === '1' ? '운영중' : '운영종료';
  return [
    `[정책명] ${f.fcltKindNm} - ${f.fcltNm}`,
    `[유형] 사회복지시설`,
    `[시설종류] ${f.fcltKindNm}`,
    `[시설명] ${f.fcltNm}`,
    `[운영상태] ${status}`,
    `[시설코드] ${f.fcltCd}`,
    `[신청링크] https://www.socialservice.or.kr:444/user/htmlEditor/view.do?p_sn=${f.fcltCd}`,
  ].join('\n');
}

function facilityPointId(fcltCd: string): number {
  let hash = 5381;
  const key = `facility_${fcltCd}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (hash + 1_500_000_000) % 2_147_483_647;
}

// ── API 호출 ─────────────────────────────────────────────
async function parseXml(xml: string): Promise<Record<string, unknown>> {
  return xml2js.parseStringPromise(xml, { explicitArray: false, trim: true });
}

async function fetchFacilities(pageNo: number): Promise<{ total: number; items: FacilityItem[] }> {
  try {
    const { data } = await axios.get(`${BASE_URL}/getNFcltBizInqire`, {
      params: { serviceKey: API_KEY, pageNo, numOfRows: PAGE_SIZE },
      timeout: 15000,
    });
    // API returns JSON
    const body = (data as Record<string, unknown>).response as Record<string, unknown>;
    const bodyContent = body.body as Record<string, unknown>;
    const total = parseInt(bodyContent.totalCount as string, 10);
    const rawItems = (bodyContent.items as Record<string, unknown>)?.item;
    if (!rawItems) return { total, items: [] };
    const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
    return { total, items: arr.filter((f) => String(f.fcltStatus) === '1') };
  } catch (e) {
    console.error('fetchFacilities error:', e);
    return { total: 0, items: [] };
  }
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function prepareFacilities(items: FacilityItem[]): PreparedFacility[] {
  return items.map((item) => {
    const policyId = `facility_${item.fcltCd}`;
    const content = buildPageContent(item);
    return {
      item,
      policyId,
      graphId: item.fcltCd,
      content,
      syncHash: makeSyncHash({
        policyId,
        content,
        kindCode: item.fcltKindCd,
        status: item.fcltStatus,
      }),
    };
  });
}

// ── Qdrant upsert (with retry) ────────────────────────────────────────
async function upsertToQdrant(facilities: PreparedFacility[], embeddings: number[][]): Promise<void> {
  const points = facilities.map(({ item: f, policyId, content, syncHash }, i) => ({
    id: facilityPointId(f.fcltCd),
    vector: embeddings[i],
    payload: {
      policyId,
      policyName: `${f.fcltKindNm} - ${f.fcltNm}`,
      category: f.fcltKindNm,
      content,
      status: 'active',
      source: 'welfare_facility',
      fcltCd: f.fcltCd,
      fcltKindCd: f.fcltKindCd,
      syncHash,
    },
  }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`  Qdrant upsert 재시도 (${attempt}/3)...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// ── Neo4j upsert (레코드별 오류 격리) ────────────────────
async function upsertToNeo4j(facilities: PreparedFacility[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const { item: f, syncHash } of facilities) {
      const code = f.fcltCd ?? '';
      const name = f.fcltNm ?? '';
      const kindCode = f.fcltKindCd ?? '';
      const kindName = f.fcltKindNm ?? '';
      const status = String(f.fcltStatus ?? '');
      if (!code) continue; // 코드 없는 레코드 스킵
      try {
        await session.run(
          `
          MERGE (fac:WelfareFacility {code: $code})
          SET fac.name = $name, fac.kindCode = $kindCode,
              fac.kindName = $kindName, fac.status = $status,
              fac.source = 'welfare_facility', fac.syncHash = $syncHash,
              fac.updatedAt = datetime()
          `,
          { code, name, kindCode, kindName, status, syncHash },
        );
        if (kindName) {
          await session.run(
            `
            MERGE (k:FacilityKind {name: $kind})
            WITH k
            MATCH (fac:WelfareFacility {code: $code})
            MERGE (fac)-[:IS_KIND]->(k)
            `,
            { kind: kindName, code },
          );
        }
      } catch (e) {
        console.warn(`  Neo4j 스킵 [${code}]: ${(e as Error).message}`);
      }
    }
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🏥 사회복지시설 정보 적재 시작');

  // 1. 전체 목록 수집
  const { total, items: firstPage } = await fetchFacilities(1);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total}개 시설, ${totalPages} 페이지`);

  const allItems: FacilityItem[] = [...firstPage];
  const FETCH_CONCURRENCY = 10;
  for (let p = 2; p <= totalPages; p += FETCH_CONCURRENCY) {
    const chunk = Array.from({ length: Math.min(FETCH_CONCURRENCY, totalPages - p + 1) }, (_, i) => p + i);
    const results = await Promise.all(chunk.map(fetchFacilities));
    results.forEach(r => allItems.push(...r.items));
    process.stdout.write(`   수집 중: ${Math.min(p + FETCH_CONCURRENCY - 1, totalPages)}/${totalPages} 페이지\r`);
  }
  console.log(`\n✅ 운영중 시설 수집 완료: ${allItems.length}개`);

  const prepared = prepareFacilities(allItems);
  const plan = await buildIncrementalSyncPlan({
    client: qdrant,
    collectionName: COLLECTION,
    preparedItems: prepared,
    driver: neo4jDriver,
    graphLabel: 'WelfareFacility',
    graphIdProperty: 'code',
  });
  console.log(
    `   증분 대상 - 벡터 ${plan.vectorUpdates.length}건, 그래프 ${plan.graphUpdates.length}건, 스킵 ${plan.skippedCount}건`,
  );

  if (plan.vectorUpdates.length === 0 && plan.graphUpdates.length === 0) {
    console.log('✅ 변경 없음');
    return;
  }

  console.log('🔍 임베딩 + 저장 중...');
  const graphUpdateIds = new Set(plan.graphUpdates.map((item) => item.policyId));
  let vectorDone = 0;

  async function processVectorBatch(batch: PreparedFacility[]): Promise<void> {
    const embeddings = await embedTexts(batch.map((item) => item.content));
    const graphBatch = batch.filter((item) => graphUpdateIds.has(item.policyId));
    await Promise.all([
      upsertToQdrant(batch, embeddings),
      graphBatch.length > 0 ? upsertToNeo4j(graphBatch) : Promise.resolve(),
    ]);
    vectorDone += batch.length;
    process.stdout.write(`   벡터 [${vectorDone}/${plan.vectorUpdates.length}] 처리 완료\r`);
  }

  for (let i = 0; i < plan.vectorUpdates.length; i += EMBED_BATCH * EMBED_CONCURRENCY) {
    const concurrentBatches: PreparedFacility[][] = [];
    for (
      let j = i;
      j < Math.min(i + EMBED_BATCH * EMBED_CONCURRENCY, plan.vectorUpdates.length);
      j += EMBED_BATCH
    ) {
      concurrentBatches.push(plan.vectorUpdates.slice(j, j + EMBED_BATCH));
    }
    await Promise.all(concurrentBatches.map(processVectorBatch));
  }

  if (plan.graphOnlyUpdates.length > 0) {
    let graphDone = 0;
    for (let i = 0; i < plan.graphOnlyUpdates.length; i += EMBED_BATCH) {
      const batch = plan.graphOnlyUpdates.slice(i, i + EMBED_BATCH);
      await upsertToNeo4j(batch);
      graphDone += batch.length;
      process.stdout.write(`   그래프 [${graphDone}/${plan.graphOnlyUpdates.length}] 처리 완료\r`);
    }
  }

  console.log(`\n🎉 사회복지시설 증분 동기화 완료!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => { await neo4jDriver.close(); });
