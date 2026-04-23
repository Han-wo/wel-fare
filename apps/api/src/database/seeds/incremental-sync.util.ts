import { createHash } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { Driver } from 'neo4j-driver';

const LOOKUP_CHUNK_SIZE = 100;
const QDRANT_RETRY_DELAY_MS = 600;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableQdrantError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(fetch failed|socketerror|other side closed|econnreset|etimedout|und_err|429|5\d\d)/i.test(
    message,
  );
}

async function withQdrantRetry<T>(task: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableQdrantError(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(QDRANT_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

function assertCypherIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid Cypher identifier: ${value}`);
  }
  return value;
}

export function makeSyncHash(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

export interface PreparedSyncItem<T> {
  item: T;
  policyId: string;
  content: string;
  syncHash: string;
  graphId?: string;
}

export interface IncrementalSyncPlan<
  TPrepared extends PreparedSyncItem<unknown>,
> {
  vectorUpdates: TPrepared[];
  graphUpdates: TPrepared[];
  graphOnlyUpdates: TPrepared[];
  skippedCount: number;
}

export async function fetchExistingQdrantSyncHashes(
  client: QdrantClient,
  collectionName: string,
  policyIds: string[],
): Promise<Map<string, string>> {
  const syncHashes = new Map<string, string>();

  for (const idChunk of chunk(uniq(policyIds), LOOKUP_CHUNK_SIZE)) {
    let offset: string | number | Record<string, unknown> | undefined;

    do {
      const response = await withQdrantRetry(() =>
        client.scroll(collectionName, {
          filter: {
            should: idChunk.map((policyId) => ({
              key: 'policyId',
              match: { value: policyId },
            })),
          },
          limit: idChunk.length,
          offset,
          with_payload: true,
          with_vector: false,
        }),
      );

      for (const point of response.points ?? []) {
        const payload = (point.payload ?? {}) as Record<string, unknown>;
        const policyId = String(payload.policyId ?? '');
        if (policyId) {
          syncHashes.set(policyId, String(payload.syncHash ?? ''));
        }
      }

      offset = ((response as Record<string, unknown>).next_page_offset ??
        undefined) as string | number | Record<string, unknown> | undefined;
    } while (offset != null);
  }

  return syncHashes;
}

export async function fetchExistingNeo4jSyncHashes(
  driver: Driver,
  label: string,
  ids: string[],
  idProperty = 'id',
  hashProperty = 'syncHash',
): Promise<Map<string, string>> {
  const safeLabel = assertCypherIdentifier(label);
  const safeIdProperty = assertCypherIdentifier(idProperty);
  const safeHashProperty = assertCypherIdentifier(hashProperty);
  const syncHashes = new Map<string, string>();
  const session = driver.session();

  try {
    for (const idChunk of chunk(uniq(ids), LOOKUP_CHUNK_SIZE)) {
      const result = await session.run(
        `
        MATCH (n:${safeLabel})
        WHERE n.${safeIdProperty} IN $ids
        RETURN n.${safeIdProperty} AS id, n.${safeHashProperty} AS syncHash
        `,
        { ids: idChunk },
      );

      for (const record of result.records) {
        const id = String(record.get('id') ?? '');
        if (id) {
          syncHashes.set(id, String(record.get('syncHash') ?? ''));
        }
      }
    }
  } finally {
    await session.close();
  }

  return syncHashes;
}

export async function buildIncrementalSyncPlan<
  TPrepared extends PreparedSyncItem<unknown>,
>(params: {
  client: QdrantClient;
  collectionName: string;
  preparedItems: TPrepared[];
  driver?: Driver;
  graphLabel?: string;
  graphIdProperty?: string;
  graphHashProperty?: string;
}): Promise<IncrementalSyncPlan<TPrepared>> {
  const {
    client,
    collectionName,
    preparedItems,
    driver,
    graphLabel,
    graphIdProperty = 'id',
    graphHashProperty = 'syncHash',
  } = params;

  const vectorHashes = await fetchExistingQdrantSyncHashes(
    client,
    collectionName,
    preparedItems.map((item) => item.policyId),
  );
  const vectorUpdates = preparedItems.filter(
    (item) => vectorHashes.get(item.policyId) !== item.syncHash,
  );

  if (!driver || !graphLabel) {
    return {
      vectorUpdates,
      graphUpdates: [],
      graphOnlyUpdates: [],
      skippedCount: preparedItems.length - vectorUpdates.length,
    };
  }

  const graphHashes = await fetchExistingNeo4jSyncHashes(
    driver,
    graphLabel,
    preparedItems.map((item) => item.graphId ?? item.policyId),
    graphIdProperty,
    graphHashProperty,
  );
  const graphUpdates = preparedItems.filter(
    (item) =>
      graphHashes.get(item.graphId ?? item.policyId) !== item.syncHash,
  );
  const vectorPolicyIds = new Set(
    vectorUpdates.map((item) => item.policyId),
  );
  const graphOnlyUpdates = graphUpdates.filter(
    (item) => !vectorPolicyIds.has(item.policyId),
  );
  const touchedPolicyIds = new Set([
    ...vectorUpdates.map((item) => item.policyId),
    ...graphUpdates.map((item) => item.policyId),
  ]);

  return {
    vectorUpdates,
    graphUpdates,
    graphOnlyUpdates,
    skippedCount: preparedItems.length - touchedPolicyIds.size,
  };
}
