import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(@InjectRepository(Notification) private repo: Repository<Notification>) {}

  findAll(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async markRead(userId: string, id: string) {
    await this.repo.update({ id, userId }, { isRead: true });
    return this.repo.findOne({ where: { id } });
  }

  async markAllRead(userId: string) {
    const result = await this.repo.update({ userId, isRead: false }, { isRead: true });
    return { updated: result.affected ?? 0 };
  }
}
