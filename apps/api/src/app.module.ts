import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Connection } from 'mongoose';
import { SecurityModule } from './common/auth/security.module.js';
import { toJSONPlugin } from './common/mongo/to-json.plugin.js';
import { throttlers } from './common/throttle.js';
import { RedisModule } from './common/redis/redis.module.js';
import configuration, { type AppConfig } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CampaignsModule } from './modules/campaigns/campaigns.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { CentersModule } from './modules/centers/centers.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { CourierModule } from './modules/courier/courier.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RulesModule } from './modules/rules/rules.module.js';
import { SmsModule } from './modules/sms/sms.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ZonesModule } from './modules/zones/zones.module.js';

/** Infrastructure shared by the API and the seed scripts. */
export const infraImports = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], load: [configuration] }),
  MongooseModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      uri: config.getOrThrow<AppConfig>('app').mongoUri,
      serverSelectionTimeoutMS: 5000,
      connectionFactory: (connection: Connection) => {
        connection.plugin(toJSONPlugin);
        return connection;
      },
    }),
  }),
  RedisModule,
  DatabaseModule,
  SmsModule,
];

@Module({
  imports: [
    ...infraImports,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: throttlers(config.getOrThrow<AppConfig>('app').throttle),
        errorMessage: 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید',
      }),
    }),
    SecurityModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    PricingModule,
    RulesModule,
    CampaignsModule,
    NotificationsModule,
    PaymentsModule,
    UploadsModule,
    OrdersModule,
    CourierModule,
    ZonesModule,
    CentersModule,
    CmsModule,
    CustomersModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
