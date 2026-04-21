import { describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { PoliciesService } from './policies.service';
import { Policy } from './entities/policy.entity';

function createQueryBuilderMock() {
  return {
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
  };
}

describe('PoliciesService', () => {
  it('uses camelCase column names for region filtering and synced ordering', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<Policy>;
    const service = new PoliciesService(repo);

    await service.findAll({ sidoCode: '11', page: 2, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      ":sidoCode = ANY(p.sidoCodes) OR 'ALL' = ANY(p.sidoCodes)",
      { sidoCode: '11' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('p.syncedAt', 'DESC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
  });

  it('searches targetSummary instead of the old snake_case column name', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<Policy>;
    const service = new PoliciesService(repo);

    await service.search('청년');

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'p.name ILIKE :q OR p.summary ILIKE :q OR p.targetSummary ILIKE :q',
      { q: '%청년%' },
    );
  });
});
