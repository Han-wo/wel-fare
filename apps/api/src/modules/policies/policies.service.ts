import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Policy } from './entities/policy.entity';

const CATEGORY_GROUP_PATTERNS = {
  HOUSING: ['주거'],
  JOB: ['일자리', '직업훈련', '직업'],
  CARE: ['돌봄', '보육', '입양', '위탁', '보호'],
  HEALTH: ['건강', '의료'],
  FINANCE: ['금융', '서민금융', '생활지원', '에너지'],
  EDUCATION: ['교육', '학습', '문화', '여가'],
} as const;

type PolicySort = 'recent' | 'deadline';
type CategoryGroup = keyof typeof CATEGORY_GROUP_PATTERNS;

function isCategoryGroup(value: string): value is CategoryGroup {
  return value in CATEGORY_GROUP_PATTERNS;
}

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
  ) {}

  async findAll(params: {
    category?: string;
    categoryGroup?: string;
    sidoCode?: string;
    status?: string;
    q?: string;
    sort?: PolicySort;
    page?: number;
    limit?: number;
  }) {
    const {
      category,
      categoryGroup,
      sidoCode,
      status = 'ACTIVE',
      q,
      sort = 'recent',
      page = 1,
      limit = 20,
    } = params;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const qb = this.policyRepo.createQueryBuilder('p');

    if (category) qb.andWhere('p.category = :category', { category });
    if (categoryGroup && isCategoryGroup(categoryGroup)) {
      const patterns = CATEGORY_GROUP_PATTERNS[categoryGroup];
      if (patterns) {
        qb.andWhere(
          new Brackets((groupQb) => {
            patterns.forEach((pattern, index) => {
              groupQb.orWhere(
                `(p.category ILIKE :pattern${index} OR COALESCE(p.subcategory, '') ILIKE :pattern${index})`,
                { [`pattern${index}`]: `%${pattern}%` },
              );
            });
          }),
        );
      }
    }
    if (status) qb.andWhere('p.status = :status', { status });
    if (sidoCode) qb.andWhere(':sidoCode = ANY(p.sidoCodes) OR \'ALL\' = ANY(p.sidoCodes)', { sidoCode });
    if (q?.trim()) {
      const search = `%${q.trim()}%`;
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('p.name ILIKE :q', { q: search })
            .orWhere('p.summary ILIKE :q', { q: search })
            .orWhere('p.targetSummary ILIKE :q', { q: search })
            .orWhere('p.provider ILIKE :q', { q: search })
            .orWhere('p.category ILIKE :q', { q: search })
            .orWhere('COALESCE(p.subcategory, \'\') ILIKE :q', { q: search });
        }),
      );
    }

    qb.skip((pageNumber - 1) * limitNumber).take(limitNumber);

    if (sort === 'deadline') {
      qb
        .orderBy('CASE WHEN p.applicationEnd IS NULL THEN 1 ELSE 0 END', 'ASC')
        .addOrderBy('p.applicationEnd', 'ASC')
        .addOrderBy('p.syncedAt', 'DESC')
        .addOrderBy('p.createdAt', 'DESC');
    } else {
      qb.orderBy('p.syncedAt', 'DESC').addOrderBy('p.createdAt', 'DESC');
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
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
