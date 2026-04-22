import { QdrantClient } from '@qdrant/js-client-rest';
import { getSidoCode } from '@welfare-ai/shared-utils';
import { syncPoliciesToPostgres, closePolicySyncDataSource, type RelationalPolicyUpsertInput } from './policy-relational-sync.util';

type QdrantPayload = {
  policyId?: string;
  policyName?: string;
  category?: string;
  region?: string;
  sigungu?: string;
  ministry?: string;
  lifeStage?: string;
  targetGroup?: string;
  provisionType?: string;
  content?: string;
  applyUrl?: string;
  status?: string;
  source?: string;
};

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';
const SOURCES = (process.env.POLICY_BACKFILL_SOURCES ?? 'local_bokjiro')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const BATCH_SIZE = 200;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

function splitValues(value?: string) {
  return value
    ?.split(/,|>/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function extractSection(content: string | undefined, labels: string[]) {
  if (!content) return null;

  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`\\[${escapedLabel}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`));
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
  }

  return null;
}

function toExternalId(source: string, policyId: string) {
  if (source === 'youth_center' && policyId.startsWith('youth_')) {
    return `${source}:${policyId.slice('youth_'.length)}`;
  }

  return `${source}:${policyId}`;
}

function toRelationalPolicyInput(
  source: string,
  pointId: number | string,
  payload: QdrantPayload,
): RelationalPolicyUpsertInput | null {
  const policyId = String(payload.policyId ?? '').trim();
  const name = String(payload.policyName ?? '').trim();

  if (!policyId || !name) {
    return null;
  }

  const categories = splitValues(payload.category);
  const region = payload.region?.trim();
  const summary = extractSection(payload.content, ['개요', '정책설명']);
  const targetSummary =
    extractSection(payload.content, ['지원대상', '연령 조건']) ??
    payload.targetGroup?.trim() ??
    payload.lifeStage?.trim() ??
    null;
  const tags = [
    ...categories,
    ...splitValues(payload.lifeStage),
    ...splitValues(payload.targetGroup),
    region,
    payload.sigungu?.trim(),
  ].filter(Boolean) as string[];
  const sidoCodes =
    source === 'local_bokjiro'
      ? [getSidoCode(region ?? '')].filter(Boolean) as string[]
      : [];

  return {
    externalId: toExternalId(source, policyId),
    source,
    name,
    category: categories[0] ?? '정책',
    subcategory: categories.slice(1).join(' · ') || null,
    provider: payload.ministry?.trim() || null,
    summary,
    content: payload.content?.trim() || null,
    targetSummary,
    benefitType: payload.provisionType?.trim() || null,
    status: String(payload.status ?? 'ACTIVE').toUpperCase(),
    applyUrl: payload.applyUrl?.trim() || null,
    sidoCodes,
    tags,
    rawData: payload as Record<string, unknown>,
    qdrantPointId: String(pointId),
    neo4jNodeId: policyId,
    requirements: [],
  };
}

async function backfillSource(source: string) {
  console.log(`📦 Qdrant -> Postgres backfill 시작: ${source}`);

  let offset: number | string | Record<string, unknown> | undefined;
  let processed = 0;

  while (true) {
    const response = await qdrant.scroll(COLLECTION, {
      limit: BATCH_SIZE,
      offset,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ key: 'source', match: { value: source } }],
      },
    });

    const batch = (response.points ?? [])
      .map((point) =>
        toRelationalPolicyInput(
          source,
          point.id as number | string,
          (point.payload ?? {}) as QdrantPayload,
        ),
      )
      .filter(Boolean) as RelationalPolicyUpsertInput[];

    await syncPoliciesToPostgres(batch);

    processed += batch.length;
    console.log(`   ${processed}건 처리 완료`);

    if (!response.next_page_offset) {
      break;
    }
    offset = response.next_page_offset as number | string | Record<string, unknown>;
  }

  console.log(`✅ ${source} backfill 완료: ${processed}건`);
}

async function main() {
  console.log(`🚀 정책 관계형 백필 시작 (${SOURCES.join(', ')})`);

  for (const source of SOURCES) {
    await backfillSource(source);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePolicySyncDataSource();
  });
