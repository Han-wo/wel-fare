import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { Policy } from '../policies/entities/policy.entity';

export type BookmarkWithPolicy = Bookmark & { policy: Policy | null };

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(Bookmark) private repo: Repository<Bookmark>,
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
  ) {}

  async findAll(userId: string): Promise<BookmarkWithPolicy[]> {
    const bookmarks = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (bookmarks.length === 0) return [];

    const policyIds = Array.from(new Set(bookmarks.map((b) => b.policyId)));
    const policies = await this.policyRepo.findBy({ id: In(policyIds) });
    const policyMap = new Map(policies.map((p) => [p.id, p]));

    return bookmarks.map((b) => ({ ...b, policy: policyMap.get(b.policyId) ?? null }));
  }

  add(userId: string, policyId: string) {
    return this.repo.save(this.repo.create({ userId, policyId }));
  }

  async updateStatus(id: string, status: string) {
    await this.repo.update(id, {
      status,
      ...(status === 'APPLIED' ? { appliedAt: new Date() } : {}),
    });
    return this.repo.findOne({ where: { id } });
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}
