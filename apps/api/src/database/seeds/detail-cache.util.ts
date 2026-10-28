import { DataSource } from 'typeorm';
import { getRequiredEnv } from '../../common/env.util';

/**
 * 복지로 상세 조회의 일일 한도 대응.
 *
 * 문제: 복지로 OpenAPI는 개발 계정 기준 일 1,000건인데, 시더는 목록 전건
 * (중앙 461 + 지자체 5,039)의 상세를 매 실행마다 조회했다. 증분 판정보다
 * 상세 조회가 먼저라 "안 바뀐 항목"도 전부 호출했기 때문이다.
 * 한도를 넘으면 429가 오는데 fetchDetail이 catch로 조용히 삼켜,
 * 상세가 빈 채로 저장되고 로그에는 성공으로 남았다
 * (실측: 중앙 461건 중 상세 보유 99건, 지자체 5,039건 중 101건).
 *
 * 게다가 syncHash가 content에서 나오므로, 상세가 붙었다 안 붙었다 하면
 * 해시가 매번 바뀌어 멀쩡한 레코드가 더 나쁜 내용으로 재적재된다.
 *
 * 해결: 이미 저장된 rawData에서 상세 필드를 읽어 재사용하고, 네트워크
 * 호출은 상세가 없는 항목에만 한다. 429를 만나면 그 실행에서는 더 이상
 * 상세를 조회하지 않는다(어차피 전부 실패한다).
 */

export type DetailFields = Record<string, string | undefined>;

/** externalId → 저장된 rawData. 상세 필드가 들어 있으면 재조회가 불필요하다. */
export async function loadStoredRawData(
  source: string,
): Promise<Map<string, Record<string, unknown>>> {
  const ds = new DataSource({
    type: 'postgres',
    url: getRequiredEnv('DATABASE_URL'),
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  try {
    const rows = await ds.query<Array<{ externalId: string; rawData: Record<string, unknown> | null }>>(
      `SELECT "externalId", "rawData" FROM policies WHERE source = $1 AND "rawData" IS NOT NULL`,
      [source],
    );
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.rawData) map.set(row.externalId, row.rawData);
    }
    return map;
  } finally {
    await ds.destroy();
  }
}

/** 저장된 rawData에 상세 필드가 하나라도 있으면 재사용 대상으로 본다. */
export function pickStoredDetail(
  raw: Record<string, unknown> | undefined,
  fields: readonly string[],
): DetailFields | null {
  if (!raw) return null;
  const picked: DetailFields = {};
  let found = false;
  for (const key of fields) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      picked[key] = value;
      found = true;
    }
  }
  return found ? picked : null;
}

/**
 * 일일 한도 상태를 실행 단위로 공유한다.
 * 한 번 429를 보면 남은 항목은 호출하지 않고 저장본으로만 채운다.
 */
export class DetailBudget {
  private exhausted = false;
  private fetched = 0;
  private reused = 0;
  private failed = 0;

  get isExhausted() {
    return this.exhausted;
  }

  markExhausted() {
    if (!this.exhausted) {
      this.exhausted = true;
      console.warn(
        '⚠️  복지로 상세 조회 일일 한도 초과(429) — 남은 항목은 저장된 상세를 재사용합니다.',
      );
    }
  }

  countFetched() {
    this.fetched += 1;
  }
  countReused() {
    this.reused += 1;
  }
  countFailed() {
    this.failed += 1;
  }

  summary() {
    return `상세: 신규조회 ${this.fetched} · 저장본재사용 ${this.reused} · 미확보 ${this.failed}`;
  }
}

/** axios 에러가 복지로의 일일 한도 초과인지. */
export function isRateLimited(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 429) return true;
  // 복지로는 200 본문에 에러 코드를 담아 보내기도 한다.
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  return typeof body === 'string' && body.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS');
}
