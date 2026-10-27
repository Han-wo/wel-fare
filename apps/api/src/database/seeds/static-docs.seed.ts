/**
 * 정적 문서 시드 — API가 존재하지 않는 제도(세법 조항형 혜택 등)를 큐레이션
 * 마크다운으로 적재한다.
 *
 * 배경: 문화비 소득공제·월세 세액공제처럼 연말정산에서 자동 적용되는 세법
 * 조항은 보조금24를 포함한 어떤 공공 API에도 항목으로 존재하지 않는다
 * (보조금24는 "신청형 수혜서비스" 카탈로그). 이런 갭은 공식 안내문 기반의
 * 정적 문서로 메꾼다.
 *
 * 사용법: static-docs/*.md 에 frontmatter(policyId/policyName/category 등) +
 * 본문을 두면 이 시더가 Postgres + Qdrant(+sparse) + Neo4j에 증분 적재한다.
 * 내용 출처(sourceUrl)와 확인일(lastVerified)을 frontmatter에 남겨 추적한다.
 *
 * 실행: pnpm --filter @welfare-ai/api run db:seed:static-docs
 */
import * as fs from 'node:fs';
import { recordSeedRun } from './sync-log.util';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
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
import { buildQdrantVectors } from '../../common/sparse-vector';
import {
  closePolicySyncDataSource,
  syncPoliciesToPostgres,
  type RelationalPolicyUpsertInput,
} from './policy-relational-sync.util';

// ── 설정 ─────────────────────────────────────────────────
const DOCS_DIR = path.resolve(__dirname, 'static-docs');
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';
const SOURCE = 'static_doc';

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
interface StaticDoc {
  policyId: string;
  policyName: string;
  category: string;
  themes: string[];
  targetGroups: string[];
  applyUrl: string;
  sourceUrl: string;
  lastVerified: string;
  body: string;
  fileName: string;
}

type PreparedDoc = PreparedSyncItem<StaticDoc>;

// ── 파싱 ─────────────────────────────────────────────────
function parseFrontmatterDoc(filePath: string): StaticDoc {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`frontmatter가 없습니다: ${filePath}`);
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const required = ['policyId', 'policyName', 'category'];
  for (const key of required) {
    if (!meta[key]) {
      throw new Error(`frontmatter에 ${key}가 없습니다: ${filePath}`);
    }
  }

  const splitList = (value?: string) =>
    value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];

  return {
    policyId: meta.policyId,
    policyName: meta.policyName,
    category: meta.category,
    themes: splitList(meta.themes),
    targetGroups: splitList(meta.targetGroups),
    applyUrl: meta.applyUrl ?? '',
    sourceUrl: meta.sourceUrl ?? '',
    lastVerified: meta.lastVerified ?? '',
    body: match[2].trim(),
    fileName: path.basename(filePath),
  };
}

function docPointId(policyId: string): string {
  const hex = createHash('sha1').update(`static_doc:${policyId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function buildContent(doc: StaticDoc): string {
  const parts = [`[정책명] ${doc.policyName}`, doc.body];
  if (doc.applyUrl) parts.push(`[신청링크] ${doc.applyUrl}`);
  if (doc.sourceUrl) parts.push(`[출처] ${doc.sourceUrl} (확인일 ${doc.lastVerified || '미기재'})`);
  return parts.join('\n');
}

function prepareDocs(docs: StaticDoc[]): PreparedDoc[] {
  return docs.map((doc) => {
    const content = buildContent(doc);
    return {
      item: doc,
      policyId: doc.policyId,
      graphId: doc.policyId,
      content,
      syncHash: makeSyncHash({ policyId: doc.policyId, content }),
    };
  });
}

function toRelationalPolicyInput(doc: StaticDoc): RelationalPolicyUpsertInput {
  return {
    externalId: `static_doc:${doc.policyId}`,
    source: SOURCE,
    name: doc.policyName,
    category: doc.category,
    summary: doc.body.slice(0, 300),
    content: buildContent(doc),
    status: 'ACTIVE',
    applyUrl: doc.applyUrl || null,
    sidoCodes: ['ALL'],
    tags: [...doc.themes, ...doc.targetGroups],
    rawData: { fileName: doc.fileName, sourceUrl: doc.sourceUrl, lastVerified: doc.lastVerified },
    qdrantPointId: docPointId(doc.policyId),
    neo4jNodeId: doc.policyId,
  };
}

// ── 임베딩 ───────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ── 저장 ─────────────────────────────────────────────────
async function upsertToQdrant(docs: PreparedDoc[], embeddings: number[][]): Promise<void> {
  const points = docs.map(({ item: doc, policyId, content, syncHash }, i) => ({
    id: docPointId(doc.policyId),
    vector: buildQdrantVectors(embeddings[i], `${doc.policyName}\n${content}`),
    payload: {
      policyId,
      policyName: doc.policyName,
      category: doc.category,
      targetGroup: doc.targetGroups.join(','),
      content,
      applyUrl: doc.applyUrl,
      status: 'active',
      source: SOURCE,
      syncHash,
    },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

async function upsertToNeo4j(docs: PreparedDoc[]): Promise<void> {
  if (docs.length === 0) return;
  const rows = docs.map(({ item: doc, syncHash }) => ({
    id: doc.policyId,
    name: doc.policyName,
    summary: doc.body.slice(0, 200),
    syncHash,
    themes: doc.themes,
    targets: doc.targetGroups,
  }));

  const session = neo4jDriver.session();
  try {
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (pol:Policy {id: row.id})
      SET pol.name = row.name,
          pol.summary = row.summary,
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
  console.log('🚀 정적 문서 데이터 적재 시작');
  await ensureNeo4jConstraints(neo4jDriver);

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(DOCS_DIR, name));
  const docs = files.map(parseFrontmatterDoc);
  console.log(`   총 ${docs.length}개 정적 문서`);

  const prepared = prepareDocs(docs);
  const plan = await buildIncrementalSyncPlan({
    client: qdrant,
    collectionName: COLLECTION,
    preparedItems: prepared,
    driver: neo4jDriver,
    graphLabel: 'Policy',
  });

  const touched = new Set([
    ...plan.vectorUpdates.map((item) => item.policyId),
    ...plan.graphUpdates.map((item) => item.policyId),
  ]);
  const relationalBatch = docs
    .filter((doc) => touched.has(doc.policyId))
    .map((doc) => toRelationalPolicyInput(doc));

  let vectorUpdated = 0;
  let graphUpdated = 0;

  const vectorPromise =
    plan.vectorUpdates.length > 0
      ? (async () => {
          const embeddings = await embedTexts(plan.vectorUpdates.map((item) => item.content));
          await upsertToQdrant(plan.vectorUpdates, embeddings);
          vectorUpdated = plan.vectorUpdates.length;
        })()
      : Promise.resolve();

  const graphPromise =
    plan.graphUpdates.length > 0
      ? (async () => {
          await upsertToNeo4j(plan.graphUpdates);
          graphUpdated = plan.graphUpdates.length;
        })()
      : Promise.resolve();

  await Promise.all([vectorPromise, graphPromise, syncPoliciesToPostgres(relationalBatch)]);

  console.log(
    `🎉 정적 문서 증분 적재 완료! (벡터 ${vectorUpdated}, 그래프 ${graphUpdated}, 스킵 ${plan.skippedCount})`,
  );
}

// CLI 실행도 동기화 로그를 남긴다 — RAG 캐시 버전이 이 기록에서 나온다.
recordSeedRun('static-docs', main)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePolicySyncDataSource();
    await neo4jDriver.close();
  });
