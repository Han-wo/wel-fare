import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private messageRepo: Repository<ChatMessage>,
  ) {}

  async getSessions(userId: string) {
    return this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async createSession(userId: string, title?: string) {
    return this.sessionRepo.save(this.sessionRepo.create({ userId, title }));
  }

  async getMessages(sessionId: string) {
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteSession(id: string) {
    await this.sessionRepo.delete(id);
  }
}
