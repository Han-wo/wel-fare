/**
 * 청약홈 청약 신청·당첨자 통계 API (ApplyhomeStatSvc) → Qdrant 적재 시더
 *
 * 대상 API (6개):
 *  - getAPTReqstAreaStat    : 지역별 청약 신청자 정보 (AGE_30/40/50/60)
 *  - getAPTReqstAgeStat     : 연령별 청약 신청자 정보
 *  - getAPTPrzwnerAreaStat  : 지역별 청약 당첨자 정보
 *  - getAPTPrzwnerAgeStat   : 연령별 청약 당첨자 정보
 *  - getAPTCmpetrtAreaStat  : 지역별 청약 경쟁률 정보 (특별/일반 공급)
 *  - getAPTApsPrzwnerStat   : 지역별 가점제 당첨자 정보 (AVRG/MED/TOP/LWET_SCORE)
 *
 * 실행: ts-node -r dotenv/config --transpile-only src/database/seeds/applyhome-stat.seed.ts
 */
import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

const API_KEY = process.env.HOUSING_API_KEY ?? process.env.WELFARE_API_KEY ?? '';
const BASE_URL = 'https://api.odcloud.kr/api/ApplyhomeStatSvc/v1';
const PER_PAGE = 1000;
const EMBED_BATCH = 20;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type StatRecord = Record<string, unknown>;

// ── 데이터 수집 ───────────────────────────────────────────
async function fetchAll(endpoint: string): Promise<StatRecord[]> {
  const url = `${BASE_URL}/${endpoint}`;
  let total = 0;
  try {
    const res = await axios.get(url, {
      params: { serviceKey: API_KEY, page: 1, perPage: 3 },
      timeout: 15000,
    });
    total = Number(res.data?.totalCount ?? 0);
    if (total === 0) return [];
  } catch (e) {
    console.log(`  ${endpoint}: 조회 실패 (${(e as Error).message.slice(0, 80)})`);
    return [];
  }

  const totalPages = Math.ceil(total / PER_PAGE);
  const allData: StatRecord[] = [];

  for (let p = 1; p <= totalPages; p++) {
    try {
      const res = await axios.get(url, {
        params: { serviceKey: API_KEY, page: p, perPage: PER_PAGE },
        timeout: 30000,
      });
      allData.push(...((res.data?.data as StatRecord[]) ?? []));
      process.stdout.write(`  ${endpoint} ${p}/${totalPages}p\r`);
    } catch { /* skip */ }
  }
  return allData;
}

// ── 숫자 파싱 ─────────────────────────────────────────────
function n(v: unknown): number {
  if (v == null || v === '') return 0;
  const num = Number(String(v).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// ── 지역별 청약 신청자 정보 → content ────────────────────
// fields: STAT_DE, SUBSCRPT_AREA_CODE_NM, AGE_30, AGE_40, AGE_50, AGE_60
function buildReqstAreaContent(records: StatRecord[]): string {
  // 지역별 합산
  const areaMap = new Map<string, { age30: number; age40: number; age50: number; age60: number }>();
  for (const r of records) {
    const area = String(r.SUBSCRPT_AREA_CODE_NM ?? '전국');
    if (!areaMap.has(area)) areaMap.set(area, { age30: 0, age40: 0, age50: 0, age60: 0 });
    const s = areaMap.get(area)!;
    s.age30 += n(r.AGE_30);
    s.age40 += n(r.AGE_40);
    s.age50 += n(r.AGE_50);
    s.age60 += n(r.AGE_60);
  }
  const total30 = [...areaMap.values()].reduce((s, v) => s + v.age30, 0);
  const total40 = [...areaMap.values()].reduce((s, v) => s + v.age40, 0);
  const total50 = [...areaMap.values()].reduce((s, v) => s + v.age50, 0);
  const total60 = [...areaMap.values()].reduce((s, v) => s + v.age60, 0);
  const grand = total30 + total40 + total50 + total60;

  const topAreas = [...areaMap.entries()]
    .map(([area, v]) => ({ area, total: v.age30 + v.age40 + v.age50 + v.age60 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return [
    '[정책명] APT 지역별 청약 신청자 현황',
    '[유형] 청약 통계 정보',
    `[총 신청건수] ${grand.toLocaleString()}건`,
    `[연령대별] 30대이하: ${total30.toLocaleString()}, 40대: ${total40.toLocaleString()}, 50대: ${total50.toLocaleString()}, 60대이상: ${total60.toLocaleString()}`,
    '[지역별 신청건수 상위 10]',
    ...topAreas.map(a => `  ${a.area}: ${a.total.toLocaleString()}건`),
    '[신청링크] https://www.applyhome.co.kr',
  ].join('\n');
}

// ── 연령별 청약 신청자 정보 → content ────────────────────
// fields: STAT_DE, AGE_30, AGE_40, AGE_50, AGE_60 (월별 시계열)
function buildReqstAgeContent(records: StatRecord[]): string {
  const total30 = records.reduce((s, r) => s + n(r.AGE_30), 0);
  const total40 = records.reduce((s, r) => s + n(r.AGE_40), 0);
  const total50 = records.reduce((s, r) => s + n(r.AGE_50), 0);
  const total60 = records.reduce((s, r) => s + n(r.AGE_60), 0);
  const grand = total30 + total40 + total50 + total60;

  const pct = (v: number) => grand > 0 ? Math.round(v / grand * 1000) / 10 : 0;

  // 최근 월 데이터
  const sorted = [...records].sort((a, b) => String(b.STAT_DE ?? '').localeCompare(String(a.STAT_DE ?? '')));
  const latest = sorted[0];

  return [
    '[정책명] APT 연령별 청약 신청자 현황',
    '[유형] 청약 통계 정보',
    `[총 신청건수] ${grand.toLocaleString()}건 (누적)`,
    '[연령대별 신청 비중]',
    `  30대 이하: ${total30.toLocaleString()}건 (${pct(total30)}%)`,
    `  40대: ${total40.toLocaleString()}건 (${pct(total40)}%)`,
    `  50대: ${total50.toLocaleString()}건 (${pct(total50)}%)`,
    `  60대 이상: ${total60.toLocaleString()}건 (${pct(total60)}%)`,
    latest ? `[최근 제공연월] ${String(latest.STAT_DE ?? '')}` : '',
    latest ? `  30대이하: ${n(latest.AGE_30).toLocaleString()}, 40대: ${n(latest.AGE_40).toLocaleString()}, 50대: ${n(latest.AGE_50).toLocaleString()}, 60대이상: ${n(latest.AGE_60).toLocaleString()}` : '',
    '[신청링크] https://www.applyhome.co.kr',
  ].filter(Boolean).join('\n');
}

// ── 지역별 청약 당첨자 정보 → content ────────────────────
// fields: STAT_DE, SUBSCRPT_AREA_CODE_NM, AGE_30, AGE_40, AGE_50, AGE_60
function buildPrzwnerAreaContent(records: StatRecord[]): string {
  const areaMap = new Map<string, { age30: number; age40: number; age50: number; age60: number }>();
  for (const r of records) {
    const area = String(r.SUBSCRPT_AREA_CODE_NM ?? '전국');
    if (!areaMap.has(area)) areaMap.set(area, { age30: 0, age40: 0, age50: 0, age60: 0 });
    const s = areaMap.get(area)!;
    s.age30 += n(r.AGE_30);
    s.age40 += n(r.AGE_40);
    s.age50 += n(r.AGE_50);
    s.age60 += n(r.AGE_60);
  }
  const total30 = [...areaMap.values()].reduce((s, v) => s + v.age30, 0);
  const total40 = [...areaMap.values()].reduce((s, v) => s + v.age40, 0);
  const total50 = [...areaMap.values()].reduce((s, v) => s + v.age50, 0);
  const total60 = [...areaMap.values()].reduce((s, v) => s + v.age60, 0);
  const grand = total30 + total40 + total50 + total60;

  const topAreas = [...areaMap.entries()]
    .map(([area, v]) => ({ area, total: v.age30 + v.age40 + v.age50 + v.age60 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return [
    '[정책명] APT 지역별 청약 당첨자 현황',
    '[유형] 청약 통계 정보',
    `[총 당첨건수] ${grand.toLocaleString()}건`,
    `[연령대별 당첨] 30대이하: ${total30.toLocaleString()}, 40대: ${total40.toLocaleString()}, 50대: ${total50.toLocaleString()}, 60대이상: ${total60.toLocaleString()}`,
    '[지역별 당첨건수 상위 10]',
    ...topAreas.map(a => `  ${a.area}: ${a.total.toLocaleString()}건`),
    '[신청링크] https://www.applyhome.co.kr',
  ].join('\n');
}

// ── 연령별 청약 당첨자 정보 → content ────────────────────
function buildPrzwnerAgeContent(records: StatRecord[]): string {
  const total30 = records.reduce((s, r) => s + n(r.AGE_30), 0);
  const total40 = records.reduce((s, r) => s + n(r.AGE_40), 0);
  const total50 = records.reduce((s, r) => s + n(r.AGE_50), 0);
  const total60 = records.reduce((s, r) => s + n(r.AGE_60), 0);
  const grand = total30 + total40 + total50 + total60;
  const pct = (v: number) => grand > 0 ? Math.round(v / grand * 1000) / 10 : 0;

  return [
    '[정책명] APT 연령별 청약 당첨자 현황',
    '[유형] 청약 통계 정보',
    `[총 당첨건수] ${grand.toLocaleString()}건 (누적)`,
    '[연령대별 당첨 비중]',
    `  30대 이하: ${total30.toLocaleString()}건 (${pct(total30)}%) — 주로 사회초년생·청년 청약`,
    `  40대: ${total40.toLocaleString()}건 (${pct(total40)}%)`,
    `  50대: ${total50.toLocaleString()}건 (${pct(total50)}%)`,
    `  60대 이상: ${total60.toLocaleString()}건 (${pct(total60)}%)`,
    '[신청링크] https://www.applyhome.co.kr',
  ].join('\n');
}

// ── 지역별 경쟁률 정보 → content ─────────────────────────
// fields: STAT_DE, SUBSCRPT_AREA_CODE_NM, SPSPLY_HSHLDCO, SPSPLY_REQ_CNT,
//         SPSPLY_CMPET_RATE, SUPLY_HSHLDCO, SUPLY_REQ_CNT, SUPLY_CMPET_RATE
function buildCmpetAreaContent(records: StatRecord[]): string {
  const areaMap = new Map<string, {
    spSupply: number; spReq: number;
    genSupply: number; genReq: number;
  }>();
  for (const r of records) {
    const area = String(r.SUBSCRPT_AREA_CODE_NM ?? '전국');
    if (!areaMap.has(area)) areaMap.set(area, { spSupply: 0, spReq: 0, genSupply: 0, genReq: 0 });
    const s = areaMap.get(area)!;
    s.spSupply += n(r.SPSPLY_HSHLDCO);
    s.spReq += n(r.SPSPLY_REQ_CNT);
    s.genSupply += n(r.SUPLY_HSHLDCO);
    s.genReq += n(r.SUPLY_REQ_CNT);
  }

  const totSpSupply = [...areaMap.values()].reduce((s, v) => s + v.spSupply, 0);
  const totSpReq = [...areaMap.values()].reduce((s, v) => s + v.spReq, 0);
  const totGenSupply = [...areaMap.values()].reduce((s, v) => s + v.genSupply, 0);
  const totGenReq = [...areaMap.values()].reduce((s, v) => s + v.genReq, 0);

  const spRate = totSpSupply > 0 ? Math.round(totSpReq / totSpSupply * 10) / 10 : 0;
  const genRate = totGenSupply > 0 ? Math.round(totGenReq / totGenSupply * 10) / 10 : 0;

  const areaLines = [...areaMap.entries()]
    .map(([area, v]) => {
      const gr = v.genSupply > 0 ? Math.round(v.genReq / v.genSupply * 10) / 10 : 0;
      const sr = v.spSupply > 0 ? Math.round(v.spReq / v.spSupply * 10) / 10 : 0;
      return { area, gr, sr, total: v.genReq + v.spReq };
    })
    .sort((a, b) => b.gr - a.gr)
    .slice(0, 10)
    .map(a => `  ${a.area}: 일반 ${a.gr}:1, 특별 ${a.sr}:1`);

  return [
    '[정책명] APT 지역별 청약 경쟁률 현황',
    '[유형] 청약 통계 정보',
    `[일반공급] 공급 ${totGenSupply.toLocaleString()}세대, 신청 ${totGenReq.toLocaleString()}건, 평균경쟁률 ${genRate}:1`,
    `[특별공급] 공급 ${totSpSupply.toLocaleString()}세대, 신청 ${totSpReq.toLocaleString()}건, 평균경쟁률 ${spRate}:1`,
    '[지역별 일반공급 경쟁률 상위 10]',
    ...areaLines,
    '[신청링크] https://www.applyhome.co.kr',
  ].join('\n');
}

// ── 가점제 당첨자 정보 → content ─────────────────────────
// fields: STAT_DE, SUBSCRPT_AREA_CODE_NM, RESIDE_SECD_NM,
//         AVRG_SCORE, MED_SCORE, TOP_SCORE, LWET_SCORE
function buildApsPrzwnerContent(records: StatRecord[]): string {
  // 해당지역만 집계
  const local = records.filter(r => String(r.RESIDE_SECD ?? '').startsWith('01') || String(r.RESIDE_SECD_NM ?? '').includes('해당'));
  const allRecords = local.length > 0 ? local : records;

  const avgScores = allRecords.map(r => n(r.AVRG_SCORE)).filter(v => v > 0);
  const topScores = allRecords.map(r => n(r.TOP_SCORE)).filter(v => v > 0);
  const lwetScores = allRecords.map(r => n(r.LWET_SCORE)).filter(v => v > 0);

  const mean = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b) / arr.length * 10) / 10 : 0;

  // 지역별 평균 가점
  const areaMap = new Map<string, number[]>();
  for (const r of allRecords) {
    const area = String(r.SUBSCRPT_AREA_CODE_NM ?? '전국');
    if (!areaMap.has(area)) areaMap.set(area, []);
    const score = n(r.AVRG_SCORE);
    if (score > 0) areaMap.get(area)!.push(score);
  }
  const topAreaLines = [...areaMap.entries()]
    .map(([area, scores]) => ({ area, avg: mean(scores) }))
    .filter(a => a.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10)
    .map(a => `  ${a.area}: 평균 ${a.avg}점`);

  return [
    '[정책명] APT 청약 가점제 당첨자 현황',
    '[유형] 청약 통계 정보',
    `[전체 평균 당첨가점] ${mean(avgScores)}점`,
    topScores.length > 0 ? `[최고 당첨가점] ${Math.max(...topScores)}점` : '',
    lwetScores.length > 0 ? `[최저 당첨가점] ${Math.min(...lwetScores)}점` : '',
    '[지역별 평균 당첨가점 상위 10 (해당지역 기준)]',
    ...topAreaLines,
    '[참고] 가점 점수는 무주택기간, 부양가족수, 청약통장 가입기간으로 산정 (최대 84점)',
    '[신청링크] https://www.applyhome.co.kr',
  ].filter(Boolean).join('\n');
}

// ── 임베딩 ────────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: texts,
  });
  return res.data.map(d => d.embedding);
}

// ── 포인트 ID ─────────────────────────────────────────────
function pointId(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  return (hash + 1_800_000_000) % 2_147_483_647;
}

// ── Qdrant upsert ─────────────────────────────────────────
async function upsertQdrant(groups: Array<{ id: string; label: string; content: string }>): Promise<void> {
  for (let i = 0; i < groups.length; i += EMBED_BATCH) {
    const batch = groups.slice(i, i + EMBED_BATCH);
    const embeddings = await embedTexts(batch.map(g => g.content));
    const points = batch.map((g, idx) => ({
      id: pointId(`stat_${g.id}`),
      vector: embeddings[idx],
      payload: {
        policyId: `stat_${g.id}`,
        policyName: g.label,
        category: '청약 통계',
        content: g.content,
        status: 'active',
        source: 'applyhome_stat',
      },
    }));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await qdrant.upsert(COLLECTION, { wait: true, points }); break; }
      catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 2000 * attempt)); }
    }
    process.stdout.write(`  Qdrant [${Math.min(i + EMBED_BATCH, groups.length)}/${groups.length}]\r`);
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('📊 청약홈 청약 신청·당첨자 통계 적재 시작');

  const endpoints: Array<{
    ep: string;
    label: string;
    build: (r: StatRecord[]) => string;
  }> = [
    { ep: 'getAPTReqstAreaStat',   label: 'APT 지역별 청약 신청자 현황',   build: buildReqstAreaContent },
    { ep: 'getAPTReqstAgeStat',    label: 'APT 연령별 청약 신청자 현황',   build: buildReqstAgeContent },
    { ep: 'getAPTPrzwnerAreaStat', label: 'APT 지역별 청약 당첨자 현황',   build: buildPrzwnerAreaContent },
    { ep: 'getAPTPrzwnerAgeStat',  label: 'APT 연령별 청약 당첨자 현황',   build: buildPrzwnerAgeContent },
    { ep: 'getAPTCmpetrtAreaStat', label: 'APT 지역별 청약 경쟁률 현황',   build: buildCmpetAreaContent },
    { ep: 'getAPTApsPrzwnerStat',  label: 'APT 지역별 가점제 당첨자 현황', build: buildApsPrzwnerContent },
  ];

  const groups: Array<{ id: string; label: string; content: string }> = [];

  for (const { ep, label, build } of endpoints) {
    process.stdout.write(`  수집 중: ${ep}...\r`);
    const records = await fetchAll(ep);
    console.log(`  ${label}: ${records.length}건`);
    if (records.length > 0) {
      groups.push({ id: ep, label, content: build(records) });
    }
  }

  if (groups.length === 0) {
    console.log('  수집된 통계 데이터 없음');
    return;
  }

  console.log(`\n  총 ${groups.length}개 통계 문서 Qdrant 저장 중...`);
  await upsertQdrant(groups);
  console.log(`\n청약홈 통계 ${groups.length}개 문서 적재 완료!`);
}

main().catch(console.error);
