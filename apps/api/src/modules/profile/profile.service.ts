import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserProfile) private profileRepo: Repository<UserProfile>,
  ) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  async upsert(userId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      Object.assign(existing, data);
      return this.profileRepo.save(existing);
    }
    return this.profileRepo.save(this.profileRepo.create({ userId, ...data }));
  }
}
