import { createHash } from 'node:crypto';
import { chunkPolicyContent } from '../../common/content-chunking';
import type { PreparedSyncItem } from './incremental-sync.util';

/**
 * 조각 단위 Qdrant 포인트 생성.
 *
 * 청킹 전에는 "정책 1건 = 포인트 1개"였고, 포인트 ID가 정책 ID에서
 * 결정적으로 나왔다. 조각을 도입하면 한 정책이 포인트 여러 개를 갖는데,
 * 기존 전제를 그대로 두면 두 가지가 깨진다.
 *  - 증분 조회가 정책 수만큼만 읽어 뒤쪽 조각을 놓친다
 *  - stale 정리가 "기대 ID와 다른 포인트"를 전부 지워, 조각 1 이후가
 *    매 실행마다 삭제·재생성된다
 *
 * 그래서 조각 0은 기존 ID를 그대로 쓰고(이미 적재된 9천여 건이 그대로
 * 유지된다), 조각 1부터만 파생 ID를 만든다.
 */
export interface ChunkPoint<T> {
  item: T;
  policyId: string;
  /** 문서 전체 기준 해시. 조각들이 공유한다 — 어디가 바뀌든 전부 재적재. */
  syncHash: string;
  content: string;
  chunkIndex: number;
  chunkTotal: number;
  /** 시더에 따라 UUID 문자열 또는 정수다(Qdrant가 둘 다 받는다). */
  pointId: string | number;
}

/** sha1 → UUID 형태. 기존 시더들이 쓰는 포맷과 동일하게 맞춘다. */
function toUuid(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * 준비된 항목들을 조각 단위로 펼친다.
 * 조각이 하나뿐이면 기존과 완전히 동일한 포인트가 나온다(무변경).
 */
export function expandToChunkPoints<T>(
  items: PreparedSyncItem<T>[],
  basePointId: (item: PreparedSyncItem<T>) => string | number,
  seedPrefix: string,
): ChunkPoint<T>[] {
  const out: ChunkPoint<T>[] = [];

  for (const item of items) {
    const chunks = chunkPolicyContent(item.content);
    const base = basePointId(item);

    chunks.forEach((content, chunkIndex) => {
      out.push({
        item: item.item as T,
        policyId: item.policyId,
        syncHash: item.syncHash,
        content,
        chunkIndex,
        chunkTotal: chunks.length,
        // 조각 0은 기존 ID 유지 — 이미 적재된 포인트를 살린다.
        pointId:
          chunkIndex === 0
            ? base
            : toUuid(`${seedPrefix}:${item.policyId}#${chunkIndex}`),
      });
    });
  }

  return out;
}

/**
 * 이번에 쓸 포인트 ID 집합. stale 정리는 "정책에 속하지만 이 집합에 없는
 * 포인트"를 지워야 한다(조각 수가 줄면 뒤쪽 조각이 남기 때문).
 */
export function collectDesiredPointIds<T>(points: ChunkPoint<T>[]): Set<string> {
  return new Set(points.map((p) => String(p.pointId)));
}
