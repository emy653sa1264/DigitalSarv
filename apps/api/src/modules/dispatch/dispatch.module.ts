import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import { JobsService } from './jobs.service.js';

/** v4.2 dispatch & fulfilment (M3). Uses the global models; never imports the orders module (no cycles). */
@Module({
  imports: [NotificationsModule, CatalogModule],
  providers: [JobsService, DispatchNotifier],
  exports: [JobsService, DispatchNotifier],
})
export class DispatchModule {}
