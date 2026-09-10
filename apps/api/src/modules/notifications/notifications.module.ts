import { Module } from '@nestjs/common';
import { CustomerNotificationsController, NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [NotificationsController, CustomerNotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
