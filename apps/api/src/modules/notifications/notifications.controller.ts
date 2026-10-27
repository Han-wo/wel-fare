import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WebPushService } from './web-push.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly scheduler: NotificationSchedulerService,
    private readonly webPush: WebPushService,
  ) {}

  /**
   * 브라우저가 구독을 만들려면 VAPID 공개키가 먼저 필요하다.
   * 공개키는 이름 그대로 공개값이라 인증 없이 내려줘도 안전하다.
   * enabled=false면 프론트가 알림 UI를 숨긴다(키 미설정 환경).
   */
  @Get('push/key')
  getPushKey() {
    return {
      enabled: this.webPush.isEnabled(),
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    };
  }

  @Post('push/subscribe')
  async subscribe(
    @Request() req: { user: { id: string } },
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.webPush.subscribe(req.user.id, body, userAgent);
    return { ok: true };
  }

  /** 브라우저에서 알림을 끄면 구독을 지운다(만료 구독은 발송 시 자동 정리). */
  @Delete('push/subscribe')
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.webPush.unsubscribe(body.endpoint);
    return { ok: true };
  }

  /** 구독이 실제로 동작하는지 사용자가 직접 확인하는 용도. */
  @Post('push/test')
  async test(@Request() req: { user: { id: string } }) {
    const sent = await this.webPush.sendToUser(req.user.id, {
      title: 'WelfareAI 알림 테스트',
      body: '알림이 정상적으로 도착했습니다.',
      url: '/notifications',
      tag: 'push-test',
    });
    return { sent };
  }

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
