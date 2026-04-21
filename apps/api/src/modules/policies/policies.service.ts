import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy } from './entities/policy.entity';

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
  ) {}

  async findAll(params: { category?: string; sidoCode?: string; status?: string; page?: number; limit?: number }) {
    const { category, sidoCode, status = 'ACTIVE', page = 1, limit = 20 } = params;
    const qb = this.policyRepo.createQueryBuilder('p');

    if (category) qb.andWhere('p.category = :category', { category });
    if (status) qb.andWhere('p.status = :status', { status });
    if (sidoCode) qb.andWhere(':sidoCode = ANY(p.sidoCodes) OR \'ALL\' = ANY(p.sidoCodes)', { sidoCode });

    qb.skip((page - 1) * limit).take(limit).orderBy('p.syncedAt', 'DESC').addOrderBy('p.createdAt', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Policy | null> {
    const policy = await this.policyRepo.findOne({ where: { id }, relations: ['requirements'] });
    if (policy) {
      await this.policyRepo.increment({ id }, 'viewCount', 1);
    }
    return policy;
  }

  async search(q: string) {
    return this.policyRepo
      .createQueryBuilder('p')
      .where('p.name ILIKE :q OR p.summary ILIKE :q OR p.targetSummary ILIKE :q', { q: `%${q}%` })
      .andWhere('p.status = :status', { status: 'ACTIVE' })
      .orderBy('p.syncedAt', 'DESC')
      .limit(30)
      .getMany();
  }
}
