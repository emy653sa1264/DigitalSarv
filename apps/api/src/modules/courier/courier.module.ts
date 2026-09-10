import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AdminCouriersController, CourierController } from './courier.controller.js';
import { CourierService } from './courier.service.js';

@Module({
  imports: [CatalogModule, PricingModule, NotificationsModule, UploadsModule],
  controllers: [CourierController, AdminCouriersController],
  providers: [CourierService],
})
export class CourierModule {}
