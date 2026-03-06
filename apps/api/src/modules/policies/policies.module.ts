import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from './entities/policy.entity';
import { PolicyRequirement } from './entities/policy-requirement.entity';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Policy, PolicyRequirement])],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService, TypeOrmModule],
})
export class PoliciesModule {}
