import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [PricingModule, RulesModule, CampaignsModule, NotificationsModule, PaymentsModule, UploadsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
