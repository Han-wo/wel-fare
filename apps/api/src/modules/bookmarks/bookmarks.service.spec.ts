import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { BookmarksService } from './bookmarks.service';
import { Bookmark } from './entities/bookmark.entity';
import { Policy } from '../policies/entities/policy.entity';

function createService(repoOverrides: Partial<Repository<Bookmark>>) {
  const repo = {
    update: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    ...repoOverrides,
  } as unknown as Repository<Bookmark>;
  const policyRepo = {} as unknown as Repository<Policy>;
  return { service: new BookmarksService(repo, policyRepo), repo };
}

describe('BookmarksService ownership scoping', () => {
  it('updateStatus scopes the update to the requesting user', async () => {
    const { service, repo } = createService({
      update: jest.fn().mockResolvedValue({ affected: 1 }) as never,
      findOne: jest.fn().mockResolvedValue({ id: 'bm1', userId: 'u1' }) as never,
    });

    await service.updateStatus('u1', 'bm1', 'APPLIED');

    expect(repo.update).toHaveBeenCalledWith(
      { id: 'bm1', userId: 'u1' },
      expect.objectContaining({ status: 'APPLIED', appliedAt: expect.any(Date) }),
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'bm1', userId: 'u1' } });
  });

  it('updateStatus throws NotFound when the bookmark is not owned by the user', async () => {
    const { service } = createService({
      update: jest.fn().mockResolvedValue({ affected: 0 }) as never,
    });

    await expect(service.updateStatus('attacker', 'bm1', 'APPLIED')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove scopes the delete to the requesting user', async () => {
    const { service, repo } = createService({
      delete: jest.fn().mockResolvedValue({ affected: 1 }) as never,
    });

    await expect(service.remove('u1', 'bm1')).resolves.toEqual({ success: true });
    expect(repo.delete).toHaveBeenCalledWith({ id: 'bm1', userId: 'u1' });
  });

  it('remove throws NotFound when nothing was deleted (wrong owner)', async () => {
    const { service } = createService({
      delete: jest.fn().mockResolvedValue({ affected: 0 }) as never,
    });

    await expect(service.remove('attacker', 'bm1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
