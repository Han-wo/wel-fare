/**
 * 청약홈 경쟁률 API (ApplyhomeInfoCmpetRtSvc) → Qdrant + Neo4j 적재 시더
 *
 * 처리 방식: 주택형별 62,000개 레코드를 공고(PBLANC_NO)별로 집계
 *   → 공고별 요약 문서 생성 → Qdrant 저장
 *   → Neo4j HousingAnnouncement에 경쟁률 property 업데이트
 *
 * 실행: ts-node -r dotenv/config --transpile-only src/database/seeds/applyhome-cmpet.seed.ts
 */
import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';

const API_KEY = process.env.HOUSING_API_KEY ?? process.env.WELFARE_API_KEY ?? '';
const BASE_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';
const PER_PAGE = 1000;
const EMBED_BATCH = 20;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USERNAME ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'welfare_neo4j_pass'),
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface CmpetRecord {
  PBLANC_NO: string;
  HOUSE_MANAGE_NO: string;
  HOUSE_TY: string;       // 주택형 (예: 059.9982A)
  RESIDE_SENM: string;    // 해당지역/기타지역/기타
  SUBSCRPT_RANK_CODE: number; // 1순위/2순위
  SUPLY_HSHLDCO: number;  // 공급 세대수
  REQ_CNT: string;        // 신청자 수
  CMPET_RATE: string;     // 경쟁률 (예: "5.23" 또는 "(△24)")
  source: string;
}

interface PblancSummary {
  pblancNo: string;
  source: string;
  totalSupply: number;
  totalReq: number;
  avgRate: number;
  maxRate: number;
  maxRateType: string;
  rank1Rate: number;
  supplyTypes: string[];
}

// ── 데이터 수집 ───────────────────────────────────────────
async function fetchAll(endpoint: string, source: string): Promise<CmpetRecord[]> {
  const url = `${BASE_URL}/${endpoint}`;
  let first: Record<string, unknown>;
  try {
    const res = await axios.get(url, { params: { serviceKey: API_KEY, page: 1, perPage: 3 }, timeout: 15000 });
    first = res.data;
  } catch { return []; }
  const total: number = (first.totalCount as number) ?? 0;
  if (total === 0) return [];

  const totalPages = Math.ceil(total / PER_PAGE);
  const allData: Record<string, unknown>[] = [];

  for (let p = 1; p <= totalPages; p++) {
    try {
      const res = await axios.get(url, { params: { serviceKey: API_KEY, page: p, perPage: PER_PAGE }, timeout: 30000 });
      allData.push(...((res.data.data as Record<string, unknown>[]) ?? []));
      process.stdout.write(`  ${source} ${p}/${totalPages}p\r`);
    } catch { /* skip page */ }
  }

  return allData.map((r) => ({
    PBLANC_NO: String(r.PBLANC_NO ?? ''),
    HOUSE_MANAGE_NO: String(r.HOUSE_MANAGE_NO ?? ''),
    HOUSE_TY: String(r.HOUSE_TY ?? ''),
    RESIDE_SENM: String(r.RESIDE_SENM ?? ''),
    SUBSCRPT_RANK_CODE: Number(r.SUBSCRPT_RANK_CODE ?? 0),
    SUPLY_HSHLDCO: Number(r.SUPLY_HSHLDCO ?? 0),
    REQ_CNT: String(r.REQ_CNT ?? '0'),
    CMPET_RATE: String(r.CMPET_RATE ?? '0'),
    source,
  }));
}

// ── 경쟁률 파싱 ───────────────────────────────────────────
function parseRate(raw: string): number {
  // "(△24)" → 미달(0) , "5.23" → 5.23
  if (!raw || raw.includes('△') || raw.includes('-')) return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── 공고별 집계 ───────────────────────────────────────────
function aggregate(records: CmpetRecord[]): Map<string, PblancSummary> {
  const map = new Map<string, PblancSummary>();
  for (const r of records) {
    if (!r.PBLANC_NO) continue;
    if (!map.has(r.PBLANC_NO)) {
      map.set(r.PBLANC_NO, {
        pblancNo: r.PBLANC_NO,
        source: r.source,
        totalSupply: 0,
        totalReq: 0,
        avgRate: 0,
        maxRate: 0,
        maxRateType: '',
        rank1Rate: 0,
        supplyTypes: [],
      });
    }
    const s = map.get(r.PBLANC_NO)!;
    const reqCnt = parseInt(r.REQ_CNT.replace(/,/g, ''), 10) || 0;
    const rate = parseRate(r.CMPET_RATE);
    s.totalSupply += r.SUPLY_HSHLDCO;
    s.totalReq += reqCnt;
    if (rate > s.maxRate) { s.maxRate = rate; s.maxRateType = r.HOUSE_TY; }
    if (r.SUBSCRPT_RANK_CODE === 1 && r.RESIDE_SENM === '해당지역' && rate > s.rank1Rate) {
      s.rank1Rate = rate;
    }
    if (r.HOUSE_TY && !s.supplyTypes.includes(r.HOUSE_TY)) s.supplyTypes.push(r.HOUSE_TY);
  }
  // avgRate 계산
  for (const s of map.values()) {
    s.avgRate = s.totalSupply > 0 ? Math.round((s.totalReq / s.totalSupply) * 100) / 100 : 0;
  }
  return map;
}

// ── content 생성 ──────────────────────────────────────────
function buildContent(s: PblancSummary, houseName?: string): string {
  const label = {
    apt: 'APT 분양', urbty: '오피스텔/도시형', pbl_pvt: '공공지원민간임대',
    canc: '취소후재공급', remndr: '잔여세대', opt: '임의공급',
  }[s.source] ?? s.source;
  const lines = [
    `[정책명] ${houseName ?? s.pblancNo} 청약 경쟁률`,
    `[유형] ${label} 경쟁률 정보`,
    `[공고번호] ${s.pblancNo}`,
    `[총 공급세대] ${s.totalSupply}세대`,
    `[총 신청자] ${s.totalReq.toLocaleString()}명`,
    `[평균 경쟁률] ${s.avgRate}:1`,
    `[최고 경쟁률] ${s.maxRate}:1 (${s.maxRateType})`,
  ];
  if (s.rank1Rate > 0) lines.push(`[1순위 해당지역 경쟁률] ${s.rank1Rate}:1`);
  if (s.supplyTypes.length > 0) lines.push(`[주택형] ${s.supplyTypes.slice(0, 5).join(', ')}`);
  lines.push(`[신청링크] https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetailView.do?houseManageNo=${s.pblancNo}&pblancNo=${s.pblancNo}`);
  return lines.join('\n');
}

function pointId(pblancNo: string, source: string): number {
  const key = `cmpet_${source}_${pblancNo}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  return (hash + 1_700_000_000) % 2_147_483_647;
}

// ── 임베딩 ────────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ── Qdrant upsert ─────────────────────────────────────────
async function upsertQdrant(summaries: PblancSummary[], names: Map<string, string>): Promise<void> {
  for (let i = 0; i < summaries.length; i += EMBED_BATCH) {
    const batch = summaries.slice(i, i + EMBED_BATCH);
    const texts = batch.map((s) => buildContent(s, names.get(s.pblancNo)));
    const embeddings = await embedTexts(texts);
    const points = batch.map((s, idx) => ({
      id: pointId(s.pblancNo, s.source),
      vector: embeddings[idx],
      payload: {
        policyId: `cmpet_${s.pblancNo}`,
        policyName: names.get(s.pblancNo) ?? s.pblancNo,
        category: '청약 경쟁률',
        totalSupply: s.totalSupply,
        totalReq: s.totalReq,
        avgRate: s.avgRate,
        maxRate: s.maxRate,
        rank1Rate: s.rank1Rate,
        content: buildContent(s, names.get(s.pblancNo)),
        status: 'active',
        source: 'applyhome_cmpet',
      },
    }));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await qdrant.upsert(COLLECTION, { wait: true, points }); break; }
      catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 2000 * attempt)); }
    }
    process.stdout.write(`  Qdrant [${Math.min(i + EMBED_BATCH, summaries.length)}/${summaries.length}]\r`);
  }
}

// ── Neo4j 업데이트 ────────────────────────────────────────
async function updateNeo4j(summaries: PblancSummary[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const s of summaries) {
      // HousingAnnouncement에 경쟁률 property 업데이트 (존재하면)
      await session.run(
        `
        MATCH (ann:HousingAnnouncement)
        WHERE ann.id IN [$applyhomeId, $myhomeId]
        SET ann.avgCmpetRate = $avgRate,
            ann.maxCmpetRate = $maxRate,
            ann.rank1CmpetRate = $rank1Rate,
            ann.totalReqCnt = $totalReq
        `,
        {
          applyhomeId: `applyhome_${s.pblancNo}`,
          myhomeId: `anno_${s.source}_${s.pblancNo}_0`,
          avgRate: s.avgRate,
          maxRate: s.maxRate,
          rank1Rate: s.rank1Rate,
          totalReq: s.totalReq,
        },
      ).catch(() => {});
    }
  } finally {
    await session.close();
  }
}

// ── 공고명 조회 (Qdrant payload에서) ─────────────────────
async function fetchHouseNames(pblancNos: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  // Qdrant에서 기존 applyhome 포인트의 policyName 조회
  try {
    const res = await qdrant.scroll(COLLECTION, {
      filter: { must: [{ key: 'source', match: { value: 'applyhome' } }] },
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    for (const p of res.points) {
      const policyId = p.payload?.policyId as string;
      if (policyId?.startsWith('applyhome_')) {
        const pno = policyId.replace('applyhome_', '');
        names.set(pno, p.payload?.policyName as string ?? pno);
      }
    }
  } catch { /* ignore */ }
  return names;
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('📊 청약홈 경쟁률 데이터 적재 시작');

  const endpoints: Array<[string, string]> = [
    ['getAPTLttotPblancCmpet', 'apt'],
    ['getUrbtyOfctlLttotPblancCmpet', 'urbty'],
    ['getPblPvtRentLttotPblancCmpet', 'pbl_pvt'],
    ['getCancResplLttotPblancCmpet', 'canc'],
    ['getRemndrLttotPblancCmpet', 'remndr'],
    ['getOPTLttotPblancCmpet', 'opt'],
  ];

  const allRecords: CmpetRecord[] = [];
  for (const [ep, src] of endpoints) {
    process.stdout.write(`  수집 중: ${src}...\r`);
    const records = await fetchAll(ep, src);
    console.log(`  ${src}: ${records.length}건`);
    allRecords.push(...records);
  }
  console.log(`총 ${allRecords.length}건 수집 완료`);

  const summaryMap = aggregate(allRecords);
  const summaries = [...summaryMap.values()];
  console.log(`공고별 집계: ${summaries.length}개 공고`);

  const names = await fetchHouseNames(summaries.map(s => s.pblancNo));
  console.log(`공고명 조회: ${names.size}건`);

  console.log('Qdrant 저장 중...');
  await upsertQdrant(summaries, names);

  console.log('\nNeo4j 업데이트 중...');
  await updateNeo4j(summaries);

  console.log(`\n청약홈 경쟁률 ${summaries.length}개 공고 적재 완료!`);
}

main().catch(console.error).finally(async () => { await neo4jDriver.close(); });
