/**
 * 국토교통부_마이홈포털 공공주택 모집공고 → Qdrant + Neo4j 적재 시더
 *  - 공공임대주택 모집공고: /rsdtRcritNtcList
 *  - 공공분양주택 모집공고: /ltRsdtRcritNtcList
 *
 * 실행: ts-node -r dotenv/config --transpile-only src/database/seeds/housing-announcement.seed.ts
 */
import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = process.env.WELFARE_API_KEY ?? '';
const BASE_URL = 'https://apis.data.go.kr/1613000/HWSPR02';
const PAGE_SIZE = 1000; // 데이터 적어서 한 번에 수집
const EMBED_BATCH = 50;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    process.env.NEO4J_PASSWORD ?? 'welfare_neo4j_pass',
  ),
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── 타입 ─────────────────────────────────────────────────
interface AnnouncementItem {
  pblancId: string;
  houseSn: number;
  sttusNm: string;
  pblancNm: string;
  suplyInsttNm: string;
  houseTyNm: string;
  suplyTyNm: string;
  rcritPblancDe: string;  // YYYYMMDD
  przwnerPresnatnDe: string;
  suplyHoCo: string;
  refrnc: string;
  url: string;
  pcUrl: string;
  type: 'rental' | 'sale';
}

// ── 유틸 ─────────────────────────────────────────────────
function formatDate(d: string): string {
  if (!d || d.length !== 8) return d ?? '';
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function buildPageContent(a: AnnouncementItem): string {
  const typeLabel = a.type === 'rental' ? '공공임대주택' : '공공분양주택';
  const parts: string[] = [];
  parts.push(`[정책명] ${typeLabel} 모집공고 - ${a.pblancNm}`);
  parts.push(`[유형] ${typeLabel} 모집공고`);
  if (a.suplyTyNm) parts.push(`[공급유형] ${a.suplyTyNm}`);
  if (a.houseTyNm) parts.push(`[주택유형] ${a.houseTyNm}`);
  parts.push(`[공급기관] ${a.suplyInsttNm}`);
  if (a.suplyHoCo) parts.push(`[공급호수] ${a.suplyHoCo}`);
  if (a.rcritPblancDe) parts.push(`[모집공고일] ${formatDate(a.rcritPblancDe)}`);
  if (a.przwnerPresnatnDe) parts.push(`[당첨자발표일] ${formatDate(a.przwnerPresnatnDe)}`);
  if (a.sttusNm) parts.push(`[상태] ${a.sttusNm}`);
  if (a.refrnc) parts.push(`[문의처] ${a.refrnc}`);
  if (a.url) parts.push(`[공고URL] ${a.url}`);
  return parts.join('\n');
}

function annoPointId(pblancId: string, houseSn: number, type: string): number {
  const key = `anno_${type}_${pblancId}_${houseSn}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (hash + 1_800_000_000) % 2_147_483_647;
}

// ── API 호출 ─────────────────────────────────────────────
async function fetchAnnouncements(
  endpoint: string,
  type: 'rental' | 'sale',
): Promise<AnnouncementItem[]> {
  const { data } = await axios.get(`${BASE_URL}/${endpoint}`, {
    params: { serviceKey: API_KEY, numOfRows: PAGE_SIZE, pageNo: 1 },
    timeout: 15000,
  });
  const body = data?.response?.body;
  const total = parseInt(body?.totalCount ?? '0', 10);
  if (total === 0) return [];
  const rawItems = body?.item;
  const arr: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return arr.map((i) => ({
    pblancId: String(i.pblancId ?? ''),
    houseSn: Number(i.houseSn ?? 0),
    sttusNm: String(i.sttusNm ?? ''),
    pblancNm: String(i.pblancNm ?? ''),
    suplyInsttNm: String(i.suplyInsttNm ?? ''),
    houseTyNm: String(i.houseTyNm ?? ''),
    suplyTyNm: String(i.suplyTyNm ?? ''),
    rcritPblancDe: String(i.rcritPblancDe ?? ''),
    przwnerPresnatnDe: String(i.przwnerPresnatnDe ?? ''),
    suplyHoCo: String(i.suplyHoCo ?? ''),
    refrnc: String(i.refrnc ?? ''),
    url: String(i.url ?? ''),
    pcUrl: String(i.pcUrl ?? ''),
    type,
  }));
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ── Qdrant upsert (retry) ─────────────────────────────────
async function upsertToQdrant(items: AnnouncementItem[], embeddings: number[][]): Promise<void> {
  const points = items.map((a, i) => ({
    id: annoPointId(a.pblancId, a.houseSn, a.type),
    vector: embeddings[i],
    payload: {
      policyId: `anno_${a.type}_${a.pblancId}_${a.houseSn}`,
      policyName: a.pblancNm,
      category: a.type === 'rental' ? '공공임대주택 모집공고' : '공공분양주택 모집공고',
      ministry: a.suplyInsttNm,
      supplyType: a.suplyTyNm,
      houseType: a.houseTyNm,
      annoDate: a.rcritPblancDe,
      winnerDate: a.przwnerPresnatnDe,
      supplyCount: a.suplyHoCo,
      content: buildPageContent(a),
      status: 'active',
      source: 'myhome_announcement',
      url: a.url,
    },
  }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// ── Neo4j upsert (레코드별 오류 격리) ─────────────────────
async function upsertToNeo4j(items: AnnouncementItem[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const a of items) {
      const id = `anno_${a.type}_${a.pblancId}_${a.houseSn}`;
      const name = a.pblancNm ?? '';
      const insttNm = a.suplyInsttNm ?? '';
      const suplyTyNm = a.suplyTyNm ?? '';
      const houseTyNm = a.houseTyNm ?? '';
      const annoType = a.type === 'rental' ? 'rental' : 'sale';
      if (!a.pblancId) continue;
      try {
        await session.run(
          `
          MERGE (ann:HousingAnnouncement {id: $id})
          SET ann.name = $name, ann.insttNm = $insttNm,
              ann.suplyTyNm = $suplyTyNm, ann.houseTyNm = $houseTyNm,
              ann.annoDate = $annoDate, ann.annoType = $annoType,
              ann.source = 'myhome_announcement', ann.updatedAt = datetime()
          `,
          { id, name, insttNm, suplyTyNm, houseTyNm, annoDate: a.rcritPblancDe ?? '', annoType },
        );
        if (insttNm) {
          await session.run(
            `MERGE (inst:Institution {name: $name}) WITH inst MATCH (ann:HousingAnnouncement {id: $id}) MERGE (ann)-[:SUPPLIED_BY]->(inst)`,
            { name: insttNm, id },
          );
        }
      } catch (e) {
        console.warn(`  Neo4j 스킵 [${id}]: ${(e as Error).message}`);
      }
    }
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('📢 공공주택 모집공고 적재 시작');

  const [rentalItems, saleItems] = await Promise.all([
    fetchAnnouncements('rsdtRcritNtcList', 'rental'),
    fetchAnnouncements('ltRsdtRcritNtcList', 'sale'),
  ]);
  console.log(`   임대 모집공고: ${rentalItems.length}건, 분양 모집공고: ${saleItems.length}건`);

  const allItems = [...rentalItems, ...saleItems];
  console.log(`   총 ${allItems.length}건`);

  console.log('🔍 임베딩 + 저장 중...');
  let done = 0;
  for (let i = 0; i < allItems.length; i += EMBED_BATCH) {
    const batch = allItems.slice(i, i + EMBED_BATCH);
    const texts = batch.map(buildPageContent);
    const embeddings = await embedTexts(texts);
    await Promise.all([
      upsertToQdrant(batch, embeddings),
      upsertToNeo4j(batch),
    ]);
    done += batch.length;
    process.stdout.write(`   [${done}/${allItems.length}] 처리 완료\r`);
  }
  console.log(`\n🎉 공공주택 모집공고 ${allItems.length}건 적재 완료!`);
}

main()
  .catch(console.error)
  .finally(async () => { await neo4jDriver.close(); });
