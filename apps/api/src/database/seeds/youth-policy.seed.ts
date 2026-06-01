/**
 * 청년정책 API (온라인청년센터) → Qdrant + Neo4j 적재 시더
 *
 * API: https://www.youthcenter.go.kr/go/ythip/getPlcy
 * 실행: ts-node --transpile-only src/database/seeds/youth-policy.seed.ts
 *
 * Point ID offset: 1_500_000_000 (기존 시더와 충돌 없는 구간)
 */
import axios from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';
import { ensureNeo4jConstraints } from './neo4j-constraints';
import { getRequiredEnv } from '../../common/env.util';
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
const YOUTH_API_KEY = getRequiredEnv('YOUTH_CENTER_API_KEY');
const YOUTH_BASE_URL = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';
const PAGE_SIZE = 100;
const EMBED_BATCH = 100;
const POINT_OFFSET = 1_500_000_000;
const QDRANT_LOOKUP_BATCH = 50;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';
const publicApiClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 16 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 16 }),
});

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

// ── 타입 (실제 API 응답 기반) ─────────────────────────────
interface YouthPolicy {
  plcyNo: string;             // 정책 번호
  plcyNm: string;             // 정책명
  plcyKywdNm?: string;        // 정책 키워드
  plcyExplnCn?: string;       // 정책 설명
  plcySprtCn?: string;        // 지원 내용
  plcyAplyMthdCn?: string;    // 신청 방법
  srngMthdCn?: string;        // 선정 방법
  addAplyQlfcCndCn?: string;  // 추가 신청 자격
  ptcpPrpTrgtCn?: string;     // 참여 제외 대상
  etcMttrCn?: string;         // 기타 사항
  lclsfNm?: string;           // 대분류
  mclsfNm?: string;           // 중분류
  sprvsnInstCdNm?: string;    // 주관기관명 (실제 필드)
  operInstCdNm?: string;      // 운영기관명
  sprtTrgtMinAge?: string;    // 지원 대상 최소 나이
  sprtTrgtMaxAge?: string;    // 지원 대상 최대 나이
  sprtSclCnt?: string;        // 지원 규모
  aplyYmd?: string;           // 신청 기간 (e.g., "20260225 ~ 20260630")
  bizPrdBgngYmd?: string;     // 사업 기간 시작
  bizPrdEndYmd?: string;      // 사업 기간 종료
  bizPrdEtcCn?: string;       // 사업 기간 기타
  aplyUrlAddr?: string;       // 신청 URL
  refUrlAddr1?: string;       // 참고 URL
  zipCd?: string;             // 법정시군구코드 (쉼표 구분 5자리)
  frstRegDt?: string;         // 최초 등록일
  lastMdfcnDt?: string;       // 최종 수정일
}

type PreparedYouthPolicy = PreparedSyncItem<YouthPolicy>;

// ── 유틸 ─────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRequestError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status ?? 0;
  const errorCode = error.response?.data?.errorCode;
  return (
    status === 429 ||
    status >= 500 ||
    !error.response ||
    errorCode === 'e002' ||
    ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code ?? '')
  );
}

async function withRetry<T>(task: () => Promise<T>, attempts = 4, baseDelayMs = 1000): Promise<T> {
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

function formatAplyYmd(ymd?: string): string {
  if (!ymd) return '';
  // "20260225 ~ 20260630" → "2026-02-25 ~ 2026-06-30"
  return ymd.replace(/(\d{4})(\d{2})(\d{2})/g, '$1-$2-$3');
}

function buildAgeInfo(p: YouthPolicy): string {
  const min = p.sprtTrgtMinAge ? `만 ${p.sprtTrgtMinAge}세` : '';
  const max = p.sprtTrgtMaxAge ? `만 ${p.sprtTrgtMaxAge}세` : '';
  if (min && max) return `${min} ~ ${max}`;
  return min || max;
}

function buildPageContent(p: YouthPolicy): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${p.plcyNm}`);
  parts.push(`[출처] 청년정책 (온라인청년센터)`);

  if (p.lclsfNm || p.mclsfNm) {
    parts.push(`[분류] ${[p.lclsfNm, p.mclsfNm].filter(Boolean).join(' > ')}`);
  }

  const institution = p.sprvsnInstCdNm ?? p.operInstCdNm;
  if (institution) parts.push(`[주관기관] ${institution}`);

  const ageInfo = buildAgeInfo(p);
  if (ageInfo) parts.push(`[연령 조건] ${ageInfo}`);

  if (p.plcyExplnCn) parts.push(`[정책설명]\n${cleanText(p.plcyExplnCn)}`);
  if (p.plcySprtCn) parts.push(`[지원내용]\n${cleanText(p.plcySprtCn)}`);
  if (p.sprtSclCnt) parts.push(`[지원 규모] ${p.sprtSclCnt}명`);
  if (p.addAplyQlfcCndCn) parts.push(`[신청자격]\n${cleanText(p.addAplyQlfcCndCn)}`);
  if (p.ptcpPrpTrgtCn) parts.push(`[신청 제외 대상] ${cleanText(p.ptcpPrpTrgtCn)}`);

  const applyPeriod = formatAplyYmd(p.aplyYmd);
  if (applyPeriod) parts.push(`[신청기간] ${applyPeriod}`);

  const bizStart = formatAplyYmd(p.bizPrdBgngYmd);
  const bizEnd = formatAplyYmd(p.bizPrdEndYmd);
  const bizEtc = p.bizPrdEtcCn;
  if (bizStart && bizEnd) {
    parts.push(`[사업기간] ${bizStart} ~ ${bizEnd}`);
  } else if (bizEtc) {
    parts.push(`[사업기간] ${bizEtc}`);
  }

  if (p.plcyAplyMthdCn) parts.push(`[신청방법]\n${cleanText(p.plcyAplyMthdCn)}`);
  if (p.srngMthdCn) parts.push(`[선정방법]\n${cleanText(p.srngMthdCn)}`);
  if (p.etcMttrCn) parts.push(`[유의사항]\n${cleanText(p.etcMttrCn)}`);

  const applyUrl = p.aplyUrlAddr || p.refUrlAddr1 ||
    `https://www.youthcenter.go.kr/youngPlcyMainView.do?plcyNo=${p.plcyNo}`;
  parts.push(`[신청링크] ${applyUrl}`);

  return parts.join('\n');
}

/** djb2 해시 기반 포인트 ID (1_500_000_000 offset) */
function plcyNoToPointId(plcyNo: string): number {
  const key = `youth_${plcyNo}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (POINT_OFFSET + (hash & 0x3fffffff)) % 2_147_483_647;
}

/** zipCd(5자리 쉼표구분) → 유니크 시도코드 2자리 목록 추출 */
function extractSidoCodes(zipCd?: string): string[] {
  if (!zipCd) return [];
  const codes = zipCd.split(',').map((c) => c.trim().substring(0, 2)).filter(Boolean);
  return [...new Set(codes)];
}

function extractDateRange(aplyYmd?: string) {
  if (!aplyYmd) {
    return {
      start: null,
      end: null,
    };
  }

  const matches = [...aplyYmd.matchAll(/(\d{4})(\d{2})(\d{2})/g)].map((match) =>
    `${match[1]}-${match[2]}-${match[3]}`,
  );

  return {
    start: matches[0] ?? null,
    end: matches[1] ?? null,
  };
}

async function removeStaleQdrantPoints(policies: PreparedYouthPolicy[]): Promise<number> {
  if (policies.length === 0) return 0;

  const desiredPointIds = new Map(
    policies.map(({ item, policyId }) => [policyId, String(plcyNoToPointId(item.plcyNo))]),
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
          must: [{ key: 'source', match: { value: 'youth_center' } }],
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
async function fetchYouthPolicies(
  pageNum: number,
): Promise<{ totalCount: number; list: YouthPolicy[] }> {
  const { data } = await withRetry(() =>
    publicApiClient.get(YOUTH_BASE_URL, {
      params: {
        apiKeyNm: YOUTH_API_KEY,
        pageNum,
        pageSize: PAGE_SIZE,
        rtnType: 'json',
      },
      timeout: 20000,
    }),
  );

  // 실제 응답 구조: { result: { pagging: { totCount }, youthPolicyList: [] } }
  const result = data?.result ?? {};
  const pagging = result?.pagging ?? {};
  const totalCount = parseInt(pagging?.totCount ?? '0', 10);
  const list: YouthPolicy[] = result?.youthPolicyList ?? [];

  return { totalCount, list };
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function preparePolicies(policies: YouthPolicy[]): PreparedYouthPolicy[] {
  return policies.map((policy) => {
    const policyId = `youth_${policy.plcyNo}`;
    const content = buildPageContent(policy);
    return {
      item: policy,
      policyId,
      graphId: policyId,
      content,
      syncHash: makeSyncHash({
        policyId,
        content,
        lastModifiedAt: policy.lastMdfcnDt ?? '',
        category: [policy.lclsfNm ?? '', policy.mclsfNm ?? ''],
        zipCd: policy.zipCd ?? '',
      }),
    };
  });
}

function toRelationalPolicyInput(policy: YouthPolicy): RelationalPolicyUpsertInput {
  const institution = policy.sprvsnInstCdNm ?? policy.operInstCdNm ?? '청년정책';
  const ageInfo = buildAgeInfo(policy);
  const dateRange = extractDateRange(policy.aplyYmd);
  const minAge = policy.sprtTrgtMinAge ? Number(policy.sprtTrgtMinAge) : null;
  const maxAge = policy.sprtTrgtMaxAge ? Number(policy.sprtTrgtMaxAge) : null;

  const requirements = [
    minAge !== null || maxAge !== null
      ? {
          reqType: 'AGE',
          operator: minAge !== null && maxAge !== null ? 'BETWEEN' : minAge !== null ? '>=' : '<=',
          minValue: minAge,
          maxValue: maxAge,
          description: ageInfo,
        }
      : null,
    policy.addAplyQlfcCndCn
      ? {
          reqType: 'SELECTION_CRITERIA',
          description: cleanText(policy.addAplyQlfcCndCn),
        }
      : null,
  ].filter(Boolean) as RelationalPolicyUpsertInput['requirements'];

  return {
    externalId: `youth_center:${policy.plcyNo}`,
    source: 'youth_center',
    name: policy.plcyNm,
    category: policy.lclsfNm ?? '청년정책',
    subcategory: policy.mclsfNm ?? null,
    provider: institution,
    summary: cleanText(policy.plcyExplnCn),
    content: buildPageContent(policy),
    targetSummary: '청년',
    benefitType: policy.plcyKywdNm ?? null,
    applicationStart: dateRange.start,
    applicationEnd: dateRange.end,
    status: 'ACTIVE',
    applyUrl:
      policy.aplyUrlAddr ??
      policy.refUrlAddr1 ??
      `https://www.youthcenter.go.kr/youngPlcyMainView.do?plcyNo=${policy.plcyNo}`,
    sidoCodes: extractSidoCodes(policy.zipCd),
    tags: [policy.lclsfNm, policy.mclsfNm, policy.plcyKywdNm, '청년'].filter(Boolean) as string[],
    rawData: policy as unknown as Record<string, unknown>,
    qdrantPointId: String(plcyNoToPointId(policy.plcyNo)),
    neo4jNodeId: `youth_${policy.plcyNo}`,
    requirements,
  };
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(
  policies: PreparedYouthPolicy[],
  embeddings: number[][],
): Promise<void> {
  await removeStaleQdrantPoints(policies);

  const points = policies.map(({ item: p, policyId, content, syncHash }, i) => {
    const institution = p.sprvsnInstCdNm ?? p.operInstCdNm ?? '청년정책';
    const ageInfo = buildAgeInfo(p);
    return {
      id: plcyNoToPointId(p.plcyNo),
      vector: embeddings[i],
      payload: {
        policyId,
        policyName: p.plcyNm,
        category: [p.lclsfNm, p.mclsfNm].filter(Boolean).join(' > ') || '청년정책',
        ministry: institution,
        lifeStage: '청년',
        targetGroup: '청년',
        ageInfo,
        content,
        applyUrl: p.aplyUrlAddr ?? p.refUrlAddr1 ??
          `https://www.youthcenter.go.kr/youngPlcyMainView.do?plcyNo=${p.plcyNo}`,
        status: 'active',
        source: 'youth_center',   // RAG 필터 식별자
        lclsfNm: p.lclsfNm ?? '',
        mclsfNm: p.mclsfNm ?? '',
        aplyYmd: formatAplyYmd(p.aplyYmd),
        syncHash,
      },
    };
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(policies: PreparedYouthPolicy[]): Promise<void> {
  if (policies.length === 0) return;
  const rows = policies.map(({ item: p, policyId: id, syncHash }) => {
    const themes: string[] = [];
    if (p.lclsfNm) themes.push(p.lclsfNm);
    if (p.mclsfNm && p.mclsfNm !== p.lclsfNm) themes.push(p.mclsfNm);
    return {
      id,
      name: p.plcyNm,
      ministry: p.sprvsnInstCdNm ?? p.operInstCdNm ?? '',
      summary: cleanText(p.plcyExplnCn ?? ''),
      ageInfo: buildAgeInfo(p),
      lclsfNm: p.lclsfNm ?? '',
      mclsfNm: p.mclsfNm ?? '',
      syncHash,
      themes,
      regionCodes: extractSidoCodes(p.zipCd).slice(0, 10),
    };
  });

  const session = neo4jDriver.session();
  try {
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (pol:Policy {id: row.id})
      SET pol.name = row.name,
          pol.ministry = row.ministry,
          pol.summary = row.summary,
          pol.ageInfo = row.ageInfo,
          pol.source = 'youth_center',
          pol.lclsfNm = row.lclsfNm,
          pol.mclsfNm = row.mclsfNm,
          pol.syncHash = row.syncHash,
          pol.updatedAt = datetime()
      MERGE (youthStage:LifeStage {name: '청년'})
      MERGE (pol)-[:TARGETS_LIFE_STAGE]->(youthStage)
      WITH pol, row
      FOREACH (theme IN row.themes |
        MERGE (th:Theme {name: theme})
        MERGE (pol)-[:HAS_THEME]->(th)
      )
      FOREACH (code IN row.regionCodes |
        MERGE (r:Region {code: code})
        MERGE (pol)-[:AVAILABLE_IN]->(r)
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
  console.log('🚀 청년정책 API 데이터 적재 시작');
  await ensureNeo4jConstraints(neo4jDriver);
  console.log(`   API: ${YOUTH_BASE_URL}`);
  console.log(`   컬렉션: ${COLLECTION}`);

  const allPolicies: YouthPolicy[] = [];

  // 1. 첫 페이지로 총 개수 파악
  console.log('📋 청년 정책 목록 수집 중...');
  const { totalCount, list: firstPage } = await fetchYouthPolicies(1);
  allPolicies.push(...firstPage);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`   총 ${totalCount}개 청년 정책, ${totalPages} 페이지`);

  // 2. 나머지 페이지 수집
  for (let page = 2; page <= totalPages; page++) {
    const { list } = await fetchYouthPolicies(page);
    allPolicies.push(...list);
    process.stdout.write(`   페이지 ${page}/${totalPages} 수집 완료\r`);
    await sleep(150); // 서버 부하 방지
  }
  console.log(`\n✅ 목록 수집 완료: ${allPolicies.length}개`);

  const prepared = preparePolicies(allPolicies);
  const plan = await buildIncrementalSyncPlan({
    client: qdrant,
    collectionName: COLLECTION,
    preparedItems: prepared,
    driver: neo4jDriver,
    graphLabel: 'Policy',
  });
  console.log(
    `   증분 대상 - 벡터 ${plan.vectorUpdates.length}개, 그래프 ${plan.graphUpdates.length}개, 스킵 ${plan.skippedCount}개`,
  );

  const touchedPolicyIds = new Set([
    ...plan.vectorUpdates.map((item) => item.policyId),
    ...plan.graphUpdates.map((item) => item.policyId),
  ]);
  const policyIdOf = (policy: YouthPolicy) => `youth_${policy.plcyNo}`;
  const touchedPolicies = allPolicies.filter((policy) => touchedPolicyIds.has(policyIdOf(policy)));

  if (touchedPolicies.length > 0) {
    console.log(`🗄️ Postgres 정책 동기화 중... (${touchedPolicies.length}건)`);
    for (let i = 0; i < touchedPolicies.length; i += EMBED_BATCH) {
      const relationalBatch = touchedPolicies
        .slice(i, i + EMBED_BATCH)
        .map((item) => toRelationalPolicyInput(item));
      await syncPoliciesToPostgres(relationalBatch);
      const done = Math.min(i + EMBED_BATCH, touchedPolicies.length);
      process.stdout.write(`   Postgres [${done}/${touchedPolicies.length}] 처리 완료\r`);
    }
    console.log('');
  } else {
    console.log('🗄️ Postgres 변경 없음 (전건 skip)');
  }

  if (plan.vectorUpdates.length === 0 && plan.graphUpdates.length === 0) {
    console.log('✅ 변경 없음');
    return;
  }

  console.log('🔍 임베딩 + DB 저장 중...');
  const graphUpdateIds = new Set(plan.graphUpdates.map((item) => item.policyId));
  let vectorDone = 0;
  let graphDone = 0;

  for (let i = 0; i < plan.vectorUpdates.length; i += EMBED_BATCH) {
    const batch = plan.vectorUpdates.slice(i, i + EMBED_BATCH);
    try {
      const embeddings = await embedTexts(batch.map((item) => item.content));
      const graphBatch = batch.filter((item) => graphUpdateIds.has(item.policyId));
      await Promise.all([
        upsertToQdrant(batch, embeddings),
        graphBatch.length > 0 ? upsertToNeo4j(graphBatch) : Promise.resolve(),
      ]);
      vectorDone += batch.length;
      graphDone += graphBatch.length;
    } catch (err) {
      console.error(`\n   ⚠️ 벡터 배치 [${i}~${i + batch.length}] 실패:`, (err as Error).message);
    }
    const done = Math.min(i + EMBED_BATCH, plan.vectorUpdates.length);
    process.stdout.write(`   벡터 [${done}/${plan.vectorUpdates.length}] 처리 완료\r`);
  }

  if (plan.graphOnlyUpdates.length > 0) {
    for (let i = 0; i < plan.graphOnlyUpdates.length; i += EMBED_BATCH) {
      const batch = plan.graphOnlyUpdates.slice(i, i + EMBED_BATCH);
      await upsertToNeo4j(batch);
      graphDone += batch.length;
      const done = Math.min(i + EMBED_BATCH, plan.graphOnlyUpdates.length);
      process.stdout.write(`   그래프 [${done}/${plan.graphOnlyUpdates.length}] 처리 완료\r`);
    }
  }

  console.log(`\n🎉 청년정책 데이터 증분 적재 완료!`);
  console.log(`   벡터: ${vectorDone}개 | 그래프: ${graphDone}개 | 스킵: ${plan.skippedCount}개`);
  console.log(`   총 ${totalCount}개 청년정책이 source='youth_center'로 저장됨`);
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
