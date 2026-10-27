import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { getRequiredEnv } from '../../common/env.util';

/**
 * CLI로 돌린 시더의 실행 결과를 data_sync_logs에 남긴다.
 *
 * 왜 필요한가: RAG 캐시 키에는 "그 스코프의 시더가 마지막으로 성공한 시각"이
 * 들어간다(rag-cache.service의 getDataVersion). 로그가 없으면 버전이 그대로라,
 * 데이터를 새로 넣어도 캐시가 옛 결과를 계속 내보낸다.
 *
 * 지금까지는 관리자 화면(/admin/sync)으로 돌릴 때만 로그가 쌓였고,
 * 문서화된 CLI 경로(scripts/sync-all.sh, pnpm db:seed:*)는 조용히 빠져 있었다.
 *
 * 이 기록이 실패해도 시딩 자체는 성공으로 둔다 — 로그는 부가 기능이고,
 * 데이터는 이미 적재됐기 때문이다(캐시는 TTL로 자연 만료된다).
 */
export async function recordSeedRun(
  seedKey: string,
  run: () => Promise<{ vectorCount?: number; graphCount?: number; skippedCount?: number } | void>,
): Promise<void> {
  const startedAt = new Date();
  let result: Awaited<ReturnType<typeof run>> = undefined;
  let failure: unknown = null;

  try {
    result = await run();
  } catch (error) {
    failure = error;
  }

  const finishedAt = new Date();
  try {
    await writeLog({
      seedKey,
      status: failure ? 'FAILED' : 'SUCCESS',
      startedAt,
      finishedAt,
      counts: result ?? undefined,
      error: failure ? String((failure as Error)?.message ?? failure) : null,
    });
  } catch (logError) {
    console.warn(`⚠️  동기화 로그 기록 실패(${seedKey}):`, (logError as Error).message);
  }

  if (failure) throw failure;
}

async function writeLog(input: {
  seedKey: string;
  status: 'SUCCESS' | 'FAILED';
  startedAt: Date;
  finishedAt: Date;
  counts?: { vectorCount?: number; graphCount?: number; skippedCount?: number };
  error: string | null;
}) {
  // 시더는 각자 자기 DataSource를 들고 있으므로 여기서는 짧게 열고 닫는다.
  const ds = new DataSource({
    type: 'postgres',
    url: getRequiredEnv('DATABASE_URL'),
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  try {
    await ds.query(
      `INSERT INTO data_sync_logs
         ("id", "runId", "seedKey", "seedName", "script", "orderIndex", "trigger",
          "status", "startedAt", "finishedAt", "durationMs",
          "vectorCount", "graphCount", "skippedCount", "stderr")
       VALUES ($1,$2,$3,$3,$4,0,'CLI',$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        randomUUID(),
        input.seedKey,
        `${input.seedKey}.seed.ts`,
        input.status,
        input.startedAt,
        input.finishedAt,
        input.finishedAt.getTime() - input.startedAt.getTime(),
        input.counts?.vectorCount ?? null,
        input.counts?.graphCount ?? null,
        input.counts?.skippedCount ?? null,
        input.error,
      ],
    );
  } finally {
    await ds.destroy();
  }
}
