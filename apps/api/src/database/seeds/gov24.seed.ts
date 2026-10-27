/**
 * 보조금24 원천(행정안전부_대한민국 공공서비스(혜택) 정보) → Postgres + Qdrant + Neo4j 시더
 *
 * API: https://www.data.go.kr/data/15113968/openapi.do (api.odcloud.kr/api/gov24/v3)
 *  - serviceList:   서비스 목록 (요약 필드 포함, 페이지네이션)
 *  - serviceDetail: 상세 (구비서류·지원절차 등, 전체를 페이징 수집 후 서비스ID로 조인)
 *  - supportConditions는 코드형 컬럼(JA0101 등)이라 v1에서는 미사용 — 지원대상
 *    텍스트가 RAG 판단에 충분하다. 구조화 자격 프리스크린 도입 시 여기서 소비.
 *
 * 주의:
 *  - 이 API는 공공데이터포털 계정에서 별도 활용신청(자동승인)이 필요하다.
 *    미신청 키는 -401을 반환한다.
 *  - odcloud 계열은 응답 필드가 한글 키다. 스키마가 다르면 첫 페이지에서
 *    실제 키 목록을 출력하고 종료한다(운영 중 조용한 빈 적재 방지).
 *  - 복지로(bokjiro/local_bokjiro)와 정책이 겹치므로 정규화된 서비스명이
 *    기존 정책명과 일치하면 스킵한다(중복 검색 노출 방지).
 *
 * 실행: pnpm --filter @welfare-ai/api run db:seed:gov24
 */
import axios from 'axios';
import { recordSeedRun } from './sync-log.util';
import './http-agent';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { ensureNeo4jConstraints } from './neo4j-constraints';
import { getRequiredAnyEnv, getRequiredEnv } from '../../common/env.util';
import {
  buildIncrementalSyncPlan,
  makeSyncHash,
  type PreparedSyncItem,
} from './incremental-sync.util';
import { buildQdrantVectors } from '../../common/sparse-vector';
import {
  closePolicySyncDataSource,
  syncPoliciesToPostgres,
  type RelationalPolicyUpsertInput,
} from './policy-relational-sync.util';
import { AppDataSource } from '../data-source';

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = getRequiredAnyEnv(['GOV24_API_KEY', 'PUBLIC_DATA_API_KEY']);
const BASE_URL = 'https://api.odcloud.kr/api/gov24/v3';
const PAGE_SIZE = 500;
const EMBED_BATCH = 100;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';
const SOURCE = 'gov24';

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
// odcloud 응답은 한글 키. 목록/상세를 서비스ID로 조인한 병합 레코드.
interface Gov24Service {
  serviceId: string;
  name: string;
  purpose: string; // 서비스목적요약
  field: string; // 서비스분야
  supportTarget: string; // 지원대상
  supportContent: string; // 지원내용
  selectionCriteria: string; // 선정기준
  applyMethod: string; // 신청방법
  applyDeadline: string; // 신청기한
  supportType: string; // 지원유형 (현금/현물/이용권/서비스/기타)
  userCategory: string; // 사용자구분
  organName: string; // 소관기관명
  deptName: string; // 부서명
  detailUrl: string; // 상세조회URL
  contact: string; // 전화문의
  requiredDocuments: string; // 구비서류 (상세)
  applyProcedure: string; // 지원절차 (상세)
  onlineApplyUrl: string; // 온라인신청사이트URL (상세)
  lastModified: string; // 수정일시
}

type PreparedGov24 = PreparedSyncItem<Gov24Service>;

// ── 유틸 ─────────────────────────────────────────────────
function gov24PointId(serviceId: string): string {
  // 32bit 해시 ID의 컬렉션 내 충돌 문제를 피하기 위해 SHA1 기반 UUID를 쓴다
  // (welfare-api.seed의 servIdToPointId와 같은 방식).
  const hex = createHash('sha1').update(`gov24:${serviceId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function cleanText(text?: string): string {
  if (!text) return '';
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

const str = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
};

// 복지로 정책명과의 중복 판정용 정규화: 공백·괄호 표기 차이를 무시한다.
function normalizeName(name: string): string {
  return name.replace(/[\s()\[\]·,]/g, '').toLowerCase();
}

function buildPageContent(s: Gov24Service): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${s.name}`);
  if (s.organName) parts.push(`[소관기관] ${s.organName}${s.deptName ? ' ' + s.deptName : ''}`);
  if (s.purpose) parts.push(`[개요] ${cleanText(s.purpose)}`);
  if (s.field) parts.push(`[분야] ${s.field}`);
  if (s.supportType) parts.push(`[지원유형] ${s.supportType}`);
  if (s.userCategory) parts.push(`[사용자구분] ${s.userCategory}`);
  if (s.supportTarget) parts.push(`[대상자 상세]\n${cleanText(s.supportTarget)}`);
  if (s.selectionCriteria) parts.push(`[선정기준]\n${cleanText(s.selectionCriteria)}`);
  if (s.supportContent) parts.push(`[지원내용]\n${cleanText(s.supportContent)}`);
  if (s.applyMethod) parts.push(`[신청방법] ${cleanText(s.applyMethod)}`);
  if (s.applyDeadline) parts.push(`[신청기한] ${cleanText(s.applyDeadline)}`);
  if (s.requiredDocuments) parts.push(`[구비서류]\n${cleanText(s.requiredDocuments)}`);
  if (s.applyProcedure) parts.push(`[지원절차]\n${cleanText(s.applyProcedure)}`);
  if (s.contact) parts.push(`[문의] ${s.contact}`);
  const url = s.onlineApplyUrl || s.detailUrl;
  if (url) parts.push(`[신청링크] ${url}`);
  return parts.join('\n');
}

// ── API 호출 ─────────────────────────────────────────────
async function fetchTable(
  operation: 'serviceList' | 'serviceDetail',
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  let totalCount = Infinity;

  while (rows.length < totalCount) {
    const { data } = await axios.get(`${BASE_URL}/${operation}`, {
      params: { serviceKey: API_KEY, page, perPage: PAGE_SIZE },
      timeout: 30000,
    });

    if (typeof data?.code === 'number' && data.code < 0) {
      throw new Error(`${operation} 호출 실패 (code ${data.code}): ${data.msg ?? ''}`);
    }

    totalCount = Number(data.totalCount ?? 0);
    const pageRows = Array.isArray(data.data) ? data.data : [];
    rows.push(...pageRows);

    process.stdout.write(
      `   ${operation} 페이지 ${page}/${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}\r`,
    );
    if (pageRows.length === 0) break;
    page += 1;
  }
  process.stdout.write('\n');
  return rows;
}

/**
 * odcloud 한글 키 스키마를 내부 타입으로 매핑한다. 필수 키가 없으면 실제
 * 키 목록을 출력하고 던진다 — 활용신청 후 첫 실행에서 스키마 차이를 바로 잡기 위함.
 */
function mergeAndMap(
  listRows: Array<Record<string, unknown>>,
  detailRows: Array<Record<string, unknown>>,
): Gov24Service[] {
  const sample = listRows[0] ?? {};
  if (!('서비스ID' in sample) || !('서비스명' in sample)) {
    throw new Error(
      `serviceList 스키마가 예상과 다릅니다. 실제 키: ${Object.keys(sample).join(', ')}`,
    );
  }

  const detailById = new Map(
    detailRows.map((row) => [str(row, '서비스ID'), row]),
  );

  return listRows
    .map((row) => {
      const serviceId = str(row, '서비스ID');
      const detail = detailById.get(serviceId) ?? {};
      return {
        serviceId,
        name: str(row, '서비스명'),
        purpose: str(row, '서비스목적요약') || str(detail, '서비스목적'),
        field: str(row, '서비스분야'),
        supportTarget: str(row, '지원대상') || str(detail, '지원대상'),
        supportContent: str(row, '지원내용') || str(detail, '지원내용'),
        selectionCriteria: str(row, '선정기준') || str(detail, '선정기준'),
        applyMethod: str(row, '신청방법') || str(detail, '신청방법'),
        applyDeadline: str(row, '신청기한'),
        supportType: str(row, '지원유형'),
        userCategory: str(row, '사용자구분'),
        organName: str(row, '소관기관명'),
        deptName: str(row, '부서명'),
        detailUrl: str(row, '상세조회URL'),
        contact: str(row, '전화문의'),
        requiredDocuments: str(detail, '구비서류'),
        applyProcedure: str(detail, '지원절차'),
        onlineApplyUrl: str(detail, '온라인신청사이트URL'),
        lastModified: str(row, '수정일시'),
      };
    })
    .filter((service) => service.serviceId && service.name);
}

// 복지로 계열(bokjiro/local_bokjiro)에 이미 있는 정책명은 스킵한다.
async function loadExistingPolicyNames(): Promise<Set<string>> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const rows: Array<{ name: string }> = await AppDataSource.query(
    `SELECT name FROM policies WHERE source IN ('bokjiro', 'local_bokjiro')`,
  );
  return new Set(rows.map((row) => normalizeName(row.name)));
}

// ── 임베딩 ───────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function prepareServices(services: Gov24Service[]): PreparedGov24[] {
  return services.map((service) => {
    const policyId = `gov24-${service.serviceId}`;
    const content = buildPageContent(service);
    return {
      item: service,
      policyId,
      graphId: policyId,
      content,
      syncHash: makeSyncHash({
        policyId,
        content,
        supportType: service.supportType,
        applyDeadline: service.applyDeadline,
        lastModified: service.lastModified,
      }),
    };
  });
}

function toRelationalPolicyInput(service: Gov24Service): RelationalPolicyUpsertInput {
  return {
    externalId: `gov24:${service.serviceId}`,
    source: SOURCE,
    name: service.name,
    category: service.field || '공공서비스',
    provider: [service.organName, service.deptName].filter(Boolean).join(' / ') || null,
    summary: cleanText(service.purpose),
    content: buildPageContent(service),
    targetSummary: cleanText(service.supportTarget),
    benefitType: service.supportType || null,
    status: 'ACTIVE',
    applyUrl: service.onlineApplyUrl || service.detailUrl || null,
    contact: service.contact || null,
    sidoCodes: ['ALL'],
    tags: [service.field, service.userCategory, service.supportType].filter(Boolean),
    rawData: service as unknown as Record<string, unknown>,
    qdrantPointId: gov24PointId(service.serviceId),
    neo4jNodeId: `gov24-${service.serviceId}`,
    requirements: [
      service.supportTarget
        ? { reqType: 'TARGET_DETAIL', description: cleanText(service.supportTarget) }
        : null,
      service.selectionCriteria
        ? { reqType: 'SELECTION_CRITERIA', description: cleanText(service.selectionCriteria) }
        : null,
    ].filter(Boolean) as RelationalPolicyUpsertInput['requirements'],
  };
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(services: PreparedGov24[], embeddings: number[][]): Promise<void> {
  const points = services.map(({ item: s, policyId, content, syncHash }, i) => ({
    id: gov24PointId(s.serviceId),
    vector: buildQdrantVectors(embeddings[i], `${s.name}\n${content}`),
    payload: {
      policyId,
      policyName: s.name,
      category: s.field,
      ministry: s.organName,
      targetGroup: s.userCategory,
      provisionType: s.supportType,
      content,
      applyUrl: s.onlineApplyUrl || s.detailUrl,
      status: 'active',
      source: SOURCE,
      syncHash,
    },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(services: PreparedGov24[]): Promise<void> {
  if (services.length === 0) return;
  const rows = services.map(({ item: s, policyId, syncHash }) => ({
    id: policyId,
    name: s.name,
    ministry: s.organName ?? '',
    summary: cleanText(s.purpose),
    provisionType: s.supportType ?? '',
    syncHash,
    themes: s.field ? [s.field] : [],
    targets: s.userCategory
      ? s.userCategory.split(/[,/]/).map((v) => v.trim()).filter(Boolean)
      : [],
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
          pol.provisionType = row.provisionType,
          pol.source = '${SOURCE}',
          pol.syncHash = row.syncHash,
          pol.updatedAt = datetime()
      WITH pol, row
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
  console.log('🚀 보조금24 공공서비스(혜택) 데이터 적재 시작');
  await ensureNeo4jConstraints(neo4jDriver);

  console.log('📋 서비스 목록 수집 중...');
  const [listRows, detailRows, existingNames] = await Promise.all([
    fetchTable('serviceList'),
    fetchTable('serviceDetail'),
    loadExistingPolicyNames(),
  ]);
  const allServices = mergeAndMap(listRows, detailRows);
  console.log(`   총 ${allServices.length}개 공공서비스 (상세 조인 ${detailRows.length}건)`);

  // 복지로 계열과 정책명이 겹치면 스킵 — 같은 정책이 검색에 두 번 노출되는 것 방지.
  const services = allServices.filter(
    (service) => !existingNames.has(normalizeName(service.name)),
  );
  const dedupSkipped = allServices.length - services.length;
  console.log(`   복지로 중복 스킵 ${dedupSkipped}건 → 적재 대상 ${services.length}건`);

  console.log('🔍 임베딩 + 저장 중...');
  let vectorUpdated = 0;
  let graphUpdated = 0;
  let skipped = 0;

  for (let i = 0; i < services.length; i += EMBED_BATCH) {
    const batch = services.slice(i, i + EMBED_BATCH);
    const prepared = prepareServices(batch);
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
    const relationalBatch = batch
      .filter((service) => touchedPolicyIds.has(`gov24-${service.serviceId}`))
      .map((service) => toRelationalPolicyInput(service));

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

    await Promise.all([vectorPromise, graphPromise, syncPoliciesToPostgres(relationalBatch)]);

    const done = Math.min(i + EMBED_BATCH, services.length);
    console.log(`   [${done}/${services.length}] 처리 완료`);
  }

  console.log(
    `🎉 보조금24 증분 적재 완료! (벡터 ${vectorUpdated}, 그래프 ${graphUpdated}, 스킵 ${skipped}, 중복제외 ${dedupSkipped})`,
  );
}

// CLI 실행도 동기화 로그를 남긴다 — RAG 캐시 버전이 이 기록에서 나온다.
recordSeedRun('gov24', main)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePolicySyncDataSource();
    await neo4jDriver.close();
  });
