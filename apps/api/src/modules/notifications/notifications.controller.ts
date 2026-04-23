import { Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.service.findAll(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.markRead(req.user.id, id);
  }

  @Post('read-all')
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.service.markAllRead(req.user.id);
  }
}
