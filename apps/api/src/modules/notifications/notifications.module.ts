import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Policy } from '../policies/entities/policy.entity';
import { PolicyRequirement } from '../policies/entities/policy-requirement.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WebPushService } from './web-push.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      PushSubscription,
      Bookmark,
      Policy,
      PolicyRequirement,
      UserProfile,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSchedulerService, WebPushService],
  exports: [TypeOrmModule, NotificationsService, WebPushService],
})
export class NotificationsModule {}
