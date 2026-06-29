import { describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { RagTraceService } from './rag-trace.service';
import { RagTrace } from './entities/rag-trace.entity';

function createQueryBuilderMock() {
  return {
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
}

function createService(qb: ReturnType<typeof createQueryBuilderMock>) {
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<RagTrace>;
  return new RagTraceService(repo);
}

describe('RagTraceService.listTraces', () => {
  it('applies default pagination and ordering', async () => {
    const qb = createQueryBuilderMock();
    const service = createService(qb);

    const result = await service.listTraces({});

    expect(qb.orderBy).toHaveBeenCalledWith('t.startedAt', 'DESC');
    expect(qb.take).toHaveBeenCalledWith(25);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(result).toEqual({ items: [], total: 0, limit: 25, offset: 0 });
  });

  it('clamps limit to the 1..100 range', async () => {
    const qb = createQueryBuilderMock();
    const service = createService(qb);

    await service.listTraces({ limit: 999 });
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('filters errors-only with status/error condition', async () => {
    const qb = createQueryBuilderMock();
    const service = createService(qb);

    await service.listTraces({ errorsOnly: true });

    expect(qb.andWhere).toHaveBeenCalledWith(
      "(t.status IN ('FAILED', 'ABORTED') OR t.error IS NOT NULL)",
    );
  });

  it('applies status, route and text filters', async () => {
    const qb = createQueryBuilderMock();
    const service = createService(qb);

    await service.listTraces({ status: 'FAILED', routeType: 'SEARCH', q: '기초연금' });

    expect(qb.andWhere).toHaveBeenCalledWith('t.status = :status', { status: 'FAILED' });
    expect(qb.andWhere).toHaveBeenCalledWith('t.routeType = :routeType', { routeType: 'SEARCH' });
    expect(qb.andWhere).toHaveBeenCalledWith('(t.question ILIKE :q OR t.answer ILIKE :q)', {
      q: '%기초연금%',
    });
  });
});
