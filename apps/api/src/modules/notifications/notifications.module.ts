import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Policy } from '../policies/entities/policy.entity';
import { PolicyRequirement } from '../policies/entities/policy-requirement.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Bookmark, Policy, PolicyRequirement, UserProfile]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSchedulerService],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
