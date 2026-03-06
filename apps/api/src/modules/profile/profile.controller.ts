import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileService } from './profile.service';
import { UserProfile } from './entities/user-profile.entity';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@Request() req: { user: { id: string } }) {
    return this.profileService.findByUserId(req.user.id);
  }

  @Put()
  updateProfile(
    @Request() req: { user: { id: string } },
    @Body() data: Partial<UserProfile>,
  ) {
    return this.profileService.upsert(req.user.id, data);
  }
}
