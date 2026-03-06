import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';

@Injectable()
export class BookmarksService {
  constructor(@InjectRepository(Bookmark) private repo: Repository<Bookmark>) {}

  findAll(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  add(userId: string, policyId: string) {
    return this.repo.save(this.repo.create({ userId, policyId }));
  }

  async updateStatus(id: string, status: string) {
    await this.repo.update(id, { status, ...(status === 'APPLIED' ? { appliedAt: new Date() } : {}) });
    return this.repo.findOne({ where: { id } });
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}
