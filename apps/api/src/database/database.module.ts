import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../modules/users/user.schema.js';
import { BindColor, BindColorSchema } from '../modules/catalog/schemas/bind-color.schema.js';
import { Color, ColorSchema } from '../modules/catalog/schemas/color.schema.js';
import { Extra, ExtraSchema } from '../modules/catalog/schemas/extra.schema.js';
import { Grade, GradeSchema } from '../modules/catalog/schemas/grade.schema.js';
import { Paper, PaperSchema } from '../modules/catalog/schemas/paper.schema.js';
import { Plan, PlanSchema } from '../modules/catalog/schemas/plan.schema.js';
import { Settings, SettingsSchema } from '../modules/catalog/schemas/settings.schema.js';
import { PricingRule, PricingRuleSchema } from '../modules/rules/rule.schema.js';
import { Campaign, CampaignSchema } from '../modules/campaigns/campaign.schema.js';
import { Order, OrderSchema } from '../modules/orders/order.schema.js';
import { Courier, CourierSchema } from '../modules/courier/courier.schema.js';
import { Zone, ZoneSchema } from '../modules/zones/zone.schema.js';
import { Center, CenterSchema } from '../modules/centers/center.schema.js';
import { CmsSection, CmsSectionSchema } from '../modules/cms/cms-section.schema.js';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from '../modules/notifications/notification-template.schema.js';
import { PushSubscription, PushSubscriptionSchema } from '../modules/notifications/push-subscription.schema.js';
import { UserNotification, UserNotificationSchema } from '../modules/notifications/user-notification.schema.js';
import { Upload, UploadSchema } from '../modules/uploads/upload.schema.js';

const features = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: Color.name, schema: ColorSchema },
  { name: Extra.name, schema: ExtraSchema },
  { name: Grade.name, schema: GradeSchema },
  { name: Paper.name, schema: PaperSchema },
  { name: BindColor.name, schema: BindColorSchema },
  { name: Plan.name, schema: PlanSchema },
  { name: Settings.name, schema: SettingsSchema },
  { name: PricingRule.name, schema: PricingRuleSchema },
  { name: Campaign.name, schema: CampaignSchema },
  { name: Order.name, schema: OrderSchema },
  { name: Courier.name, schema: CourierSchema },
  { name: Zone.name, schema: ZoneSchema },
  { name: Center.name, schema: CenterSchema },
  { name: CmsSection.name, schema: CmsSectionSchema },
  { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
  { name: UserNotification.name, schema: UserNotificationSchema },
  { name: PushSubscription.name, schema: PushSubscriptionSchema },
  { name: Upload.name, schema: UploadSchema },
]);

/**
 * Registers every model once and exports them globally, so cross-resource services
 * (pricing ↔ catalog ↔ rules ↔ orders ↔ courier) can inject any model without circular imports.
 */
@Global()
@Module({
  imports: [features],
  exports: [features],
})
export class DatabaseModule {}
