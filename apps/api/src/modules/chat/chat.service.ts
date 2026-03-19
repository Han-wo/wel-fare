import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatRuntimeService } from './chat-runtime.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private messageRepo: Repository<ChatMessage>,
    private readonly chatRuntime: ChatRuntimeService,
  ) {}

  async getSessions(userId: string) {
    return this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      select: ['id', 'title', 'updatedAt'],
    });
  }

  async createSession(userId: string, title?: string) {
    const normalizedTitle = title?.trim() || '새 대화';
    return this.sessionRepo.save(this.sessionRepo.create({ userId, title: normalizedTitle }));
  }

  async getMessages(userId: string, sessionId: string) {
    await this.getOwnedSession(userId, sessionId);
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async openSession(userId: string, id: string) {
    const session = await this.getOwnedSession(userId, id);
    return this.chatRuntime.openSession(session.id);
  }

  async closeSession(userId: string, id: string) {
    const session = await this.getOwnedSession(userId, id);
    return this.chatRuntime.closeSession(session.id);
  }

  async deleteSession(userId: string, id: string) {
    const session = await this.getOwnedSession(userId, id);

    await this.chatRuntime.closeSession(session.id);
    await this.messageRepo.delete({ sessionId: session.id });
    await this.sessionRepo.delete(session.id);
  }

  private async getOwnedSession(userId: string, sessionId: string): Promise<ChatSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    return session;
  }
}
