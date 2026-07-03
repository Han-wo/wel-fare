import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { UserProfileFact } from './entities/user-profile-fact.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileFactsService } from './profile-facts.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserProfile, UserProfileFact])],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileFactsService],
  exports: [ProfileService, ProfileFactsService, TypeOrmModule],
})
export class ProfileModule {}
