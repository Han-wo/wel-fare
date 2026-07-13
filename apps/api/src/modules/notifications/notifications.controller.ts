import { Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly scheduler: NotificationSchedulerService,
  ) {}

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

  /** 스케줄러 수동 실행 (관리자 전용, 테스트·운영 점검용) */
  @Post('admin/scan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  runScan() {
    return this.scheduler.runAll();
  }
}
