import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import { CentersModule } from '../centers/centers.module.js';
import { ProviderJobsService } from './provider-jobs.service.js';
import { AdminDispatchController, ProviderJobsController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { DispatchScheduler } from './dispatch.scheduler.js';
import { JobsService } from './jobs.service.js';

/** v4.2 dispatch & fulfilment (M3). Uses the global models; never imports the orders module (no cycles). */
@Module({
  imports: [NotificationsModule, CatalogModule, CentersModule],
  controllers: [AdminDispatchController, ProviderJobsController],
  providers: [JobsService, DispatchNotifier, DispatchService, ProviderJobsService, DispatchScheduler],
  exports: [JobsService, DispatchNotifier, DispatchService],
})
export class DispatchModule {}
