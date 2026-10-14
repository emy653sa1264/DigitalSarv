import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import { AdminDispatchController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { JobsService } from './jobs.service.js';

/** v4.2 dispatch & fulfilment (M3). Uses the global models; never imports the orders module (no cycles). */
@Module({
  imports: [NotificationsModule, CatalogModule],
  controllers: [AdminDispatchController],
  providers: [JobsService, DispatchNotifier, DispatchService],
  exports: [JobsService, DispatchNotifier, DispatchService],
})
export class DispatchModule {}
