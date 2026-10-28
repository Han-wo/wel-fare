/**
 * 기존 적재분 청킹 백필 (1회성, 반복 실행 안전).
 *
 * 청킹은 시더의 증분 경로에 들어갔지만, 이미 적재된 문서는 syncHash가
 * 그대로라 재적재되지 않는다(증분이 올바르게 동작한 결과다). 그래서
 * "조각나야 하는데 아직 한 덩어리인" 문서만 골라 다시 올린다.
 *
 * 조각 0의 본문도 바뀐다 — 전체 문서가 아니라 첫 조각이 되기 때문에
 * 재임베딩이 필요하다. 대상이 전체의 2%뿐이라 비용은 작다.
 *
 * 실행: pnpm --filter @welfare-ai/api run db:backfill:chunks
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { getRequiredEnv } from '../../common/env.util';
import { chunkPolicyContent, CHUNK_THRESHOLD } from '../../common/content-chunking';
import { buildQdrantVectors } from '../../common/sparse-vector';
import { POLICY_COLLECTION } from '../../common/qdrant-collections';

const EMBED_BATCH = 64;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});
const openai = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });

/**
 * Qdrant 포인트 ID는 UUID 또는 부호 없는 정수만 받는다. 지자체 시더는
 * 정수 ID를 쓰는데 Postgres에는 문자열로 저장돼 있어 그대로 보내면
 * "not a valid point ID"로 거부된다.
 */
function normalizePointId(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function toUuid(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      input: texts.slice(i, i + EMBED_BATCH),
    });
    out.push(...res.data.map((d) => d.embedding));
  }
  return out;
}

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: getRequiredEnv('DATABASE_URL'),
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  const rows = await ds.query<
    Array<{ externalId: string; name: string; content: string; source: string; qdrantPointId: string | null }>
  >(
    `SELECT "externalId", name, content, source, "qdrantPointId"
       FROM policies
      WHERE content IS NOT NULL AND length(content) > $1`,
    [CHUNK_THRESHOLD],
  );
  console.log(`대상 ${rows.length}건 (본문 ${CHUNK_THRESHOLD}자 초과)`);

  let upserted = 0;
  let deleted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const expanded: Array<{ row: (typeof rows)[number]; content: string; index: number; total: number; pointId: string | number }> = [];

    for (const row of batch) {
      const chunks = chunkPolicyContent(row.content);
      if (chunks.length <= 1) {
        skipped += 1;
        continue;
      }
      const policyId = row.externalId.includes(':')
        ? row.externalId.slice(row.externalId.indexOf(':') + 1)
        : row.externalId;
      chunks.forEach((content, index) =>
        expanded.push({
          row,
          content,
          index,
          total: chunks.length,
          // 조각 0은 기존 포인트 ID를 그대로 덮어쓴다(기존 적재를 살린다).
          pointId:
            index === 0 && row.qdrantPointId
              ? row.qdrantPointId
              : toUuid(`${row.source}:${policyId}#${index}`),
        }),
      );
    }

    if (expanded.length === 0) continue;

    const vectors = await embed(expanded.map((e) => `${e.row.name}\n${e.content}`));

    // 기존 payload를 읽어 그대로 승계한다 — 백필은 본문·조각 정보만 바꾼다.
    const basePoints = await qdrant.retrieve(POLICY_COLLECTION, {
      ids: [...new Set(expanded.filter((e) => e.index === 0).map((e) => normalizePointId(String(e.pointId))))],
      with_payload: true,
      with_vector: false,
    });
    const payloadById = new Map(
      basePoints.map((p) => [String(p.id), (p.payload ?? {}) as Record<string, unknown>]),
    );

    const points = expanded.map((e, k) => {
      const basePointId =
        e.index === 0
          ? e.pointId
          : expanded.find((x) => x.row.externalId === e.row.externalId && x.index === 0)!.pointId;
      const base = payloadById.get(String(basePointId)) ?? {};
      return {
        id: normalizePointId(String(e.pointId)),
        vector: buildQdrantVectors(vectors[k], `${e.row.name}\n${e.content}`),
        payload: { ...base, content: e.content, chunkIndex: e.index, chunkTotal: e.total },
      };
    });

    await qdrant.upsert(POLICY_COLLECTION, { wait: true, points });
    upserted += points.length;

    // 조각 수가 줄어든 경우를 대비해 범위 밖 조각을 지운다.
    const staleIds: Array<string | number> = [];
    for (const e of expanded.filter((x) => x.index === 0)) {
      const policyId = e.row.externalId.includes(':')
        ? e.row.externalId.slice(e.row.externalId.indexOf(':') + 1)
        : e.row.externalId;
      for (let n = e.total; n < e.total + 6; n++) {
        staleIds.push(toUuid(`${e.row.source}:${policyId}#${n}`));
      }
    }
    if (staleIds.length > 0) {
      await qdrant.delete(POLICY_COLLECTION, { wait: true, points: staleIds });
      deleted += staleIds.length;
    }

    console.log(`  [${Math.min(i + 50, rows.length)}/${rows.length}] 포인트 ${upserted}개 적재`);
  }

  console.log(`\n청킹 백필 완료 — 적재 ${upserted}포인트 / 조각 없음 ${skipped}건 / 고아정리 시도 ${deleted}`);
  await ds.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
