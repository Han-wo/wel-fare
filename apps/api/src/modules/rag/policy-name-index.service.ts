import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy } from '../policies/entities/policy.entity';
import type { PolicyNameIndex } from './policy-name-index';

// 3자 이하 정책명("보상금" 등)은 일반 명사와 구별되지 않아 아무 질문에나 걸린다.
// 지목 신호로 쓰기엔 오탐 비용이 커서 제외한다(코퍼스에 1건뿐).
const MIN_NAME_LENGTH = 4;

// 한 질문이 여러 정책명을 품을 수 있다(예: "청년월세"와 "청년월세 한시 특별지원").
// 게이트는 부분 매치를 허용하므로 상한만 두고 긴 것부터 싣는다.
const MAX_MATCHES = 5;

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class PolicyNameIndexService implements PolicyNameIndex, OnModuleInit {
  private readonly logger = new Logger(PolicyNameIndexService.name);
  /** 길이 내림차순 — 긴(구체적인) 이름이 먼저 잡히게 한다. */
  private names: string[] = [];
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
  ) {}

  async onModuleInit() {
    // 부트 시 한 번 채워, 첫 질문이 빈 인덱스를 만나지 않게 한다.
    await this.refresh().catch(() => undefined);
  }

  match(question: string): string[] {
    // 만료됐으면 다음 호출을 위해 백그라운드로 갱신하고, 이번엔 현재 인덱스로 답한다.
    if (Date.now() - this.loadedAt > REFRESH_INTERVAL_MS) {
      void this.refresh().catch(() => undefined);
    }

    const matches: string[] = [];
    for (const name of this.names) {
      if (!question.includes(name)) continue;
      // 이미 잡힌 더 긴 이름의 일부라면(예: "청년월세 한시 특별지원" → "청년월세")
      // 같은 정책을 가리키므로 중복해서 싣지 않는다.
      if (matches.some((picked) => picked.includes(name))) continue;
      matches.push(name);
      if (matches.length >= MAX_MATCHES) break;
    }
    return matches;
  }

  private refresh(): Promise<void> {
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const rows = await this.policyRepo
          .createQueryBuilder('p')
          .select('DISTINCT p.name', 'name')
          .where('p.status = :status', { status: 'ACTIVE' })
          .andWhere('LENGTH(p.name) >= :min', { min: MIN_NAME_LENGTH })
          .getRawMany<{ name: string }>();

        this.names = rows
          .map((row) => row.name?.trim())
          .filter((name): name is string => Boolean(name))
          .sort((a, b) => b.length - a.length);
        this.loadedAt = Date.now();
        this.logger.log(`정책명 인덱스 ${this.names.length}건 적재`);
      } catch (error) {
        // 인덱스가 비어도 하드코딩 목록으로 게이트는 계속 동작한다.
        this.logger.warn(`정책명 인덱스 적재 실패: ${(error as Error).message}`);
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }
}
