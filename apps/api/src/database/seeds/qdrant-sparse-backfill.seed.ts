/**
 * 기존 Qdrant 포인트에 text_sparse 벡터 백필.
 *
 * 하이브리드 검색(dense+sparse RRF) 도입용 1회성 마이그레이션.
 *  1. 컬렉션에 text_sparse(sparse, IDF modifier) 벡터를 추가한다(이미 있으면 통과).
 *  2. 전체 포인트를 스크롤하며 payload의 policyName+content로 sparse를 인코딩해
 *     updateVectors로 채운다. dense 벡터·payload는 건드리지 않는다.
 *
 * 임베딩 API 호출이 없어 비용이 들지 않고, 재실행해도 안전(멱등)하다.
 * 토크나이저(common/sparse-vector.ts)를 바꾸면 이 스크립트를 다시 돌려야 한다.
 *
 * 실행: pnpm --filter @welfare-ai/api run db:backfill:sparse
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  encodeSparseVector,
  SPARSE_VECTOR_NAME,
} from '../../common/sparse-vector';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const SCROLL_BATCH = 500;
const UPDATE_BATCH = 200;
const RETRY_ATTEMPTS = 4;
const RETRY_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

/**
 * 컬렉션에 sparse 벡터를 추가한다. 클라이언트 1.17에는 createVectorName이
 * 없어서 REST 엔드포인트(PUT /collections/{c}/vectors/{name})를 직접 호출한다.
 */
async function ensureSparseVector(client: QdrantClient): Promise<void> {
  const info = await client.getCollection(COLLECTION);
  const sparseConfig = (info.config.params as Record<string, unknown>)
    .sparse_vectors as Record<string, unknown> | null | undefined;
  if (sparseConfig && SPARSE_VECTOR_NAME in sparseConfig) {
    console.log(`ℹ️  sparse 벡터 '${SPARSE_VECTOR_NAME}' 이미 존재`);
    return;
  }

  const response = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/vectors/${SPARSE_VECTOR_NAME}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
      },
      body: JSON.stringify({ sparse: { modifier: 'idf' } }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `sparse 벡터 추가 실패 (${response.status}): ${await response.text()}`,
    );
  }
  console.log(`✅ sparse 벡터 '${SPARSE_VECTOR_NAME}' 추가 완료 (modifier: idf)`);
}

async function backfill() {
  const client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });

  console.log(`🚀 Qdrant sparse 백필 시작 — 컬렉션 '${COLLECTION}'`);
  await ensureSparseVector(client);

  const total = (await client.getCollection(COLLECTION)).points_count ?? 0;
  console.log(`   총 ${total}개 포인트 대상`);

  let offset: string | number | undefined | null = undefined;
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const page = await withRetry(() =>
      client.scroll(COLLECTION, {
        limit: SCROLL_BATCH,
        offset: offset ?? undefined,
        with_payload: { include: ['policyName', 'content'] },
        with_vector: false,
      }),
    );

    const updates: Array<{
      id: string | number;
      vector: Record<string, { indices: number[]; values: number[] }>;
    }> = [];

    for (const point of page.points) {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      const text = [payload.policyName, payload.content]
        .filter((value): value is string => typeof value === 'string')
        .join('\n');
      const sparse = encodeSparseVector(text);
      if (!sparse) {
        skipped += 1;
        continue;
      }
      updates.push({ id: point.id, vector: { [SPARSE_VECTOR_NAME]: sparse } });
    }

    for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
      const batch = updates.slice(i, i + UPDATE_BATCH);
      await withRetry(() =>
        client.updateVectors(COLLECTION, { wait: true, points: batch }),
      );
      updated += batch.length;
    }

    processed += page.points.length;
    console.log(`   페이지 ${Math.ceil(processed / SCROLL_BATCH)} — 처리 ${processed}/${total}`);

    offset = page.next_page_offset as string | number | null;
    if (!offset) break;
  }

  console.log(
    `🎉 sparse 백필 완료 — 갱신 ${updated}건, 스킵(텍스트 없음) ${skipped}건 / 전체 ${processed}건`,
  );
}

backfill().catch((error) => {
  console.error('❌ sparse 백필 실패:', error);
  process.exitCode = 1;
});
