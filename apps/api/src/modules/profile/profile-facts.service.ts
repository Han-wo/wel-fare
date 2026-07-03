import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfileFact } from './entities/user-profile-fact.entity';

@Injectable()
export class ProfileFactsService {
  private readonly logger = new Logger(ProfileFactsService.name);

  constructor(
    @InjectRepository(UserProfileFact)
    private readonly factRepo: Repository<UserProfileFact>,
  ) {}

  async getFacts(userId: string): Promise<Record<string, string>> {
    const rows = await this.factRepo.find({ where: { userId } });
    return rows.reduce<Record<string, string>>((facts, row) => {
      facts[row.field] = row.value;
      return facts;
    }, {});
  }

  // 같은 필드는 최신 답변으로 덮어쓴다. 실패해도 답변 파이프라인을 막지 않도록
  // 호출부에서 비치명 처리한다.
  async upsertMany(
    userId: string,
    facts: Record<string, string>,
    options: { source?: string; sessionId?: string } = {},
  ): Promise<void> {
    const source = options.source ?? 'hitl';

    for (const [field, value] of Object.entries(facts)) {
      if (!value?.trim()) continue;

      const existing = await this.factRepo.findOne({ where: { userId, field } });
      if (existing) {
        existing.value = value.trim();
        existing.source = source;
        existing.sessionId = options.sessionId;
        await this.factRepo.save(existing);
      } else {
        await this.factRepo.save(
          this.factRepo.create({
            userId,
            field,
            value: value.trim(),
            source,
            sessionId: options.sessionId,
          }),
        );
      }
    }

    this.logger.log(
      `프로필 사실 저장: userId=${userId} fields=${Object.keys(facts).join(',')}`,
    );
  }
}
