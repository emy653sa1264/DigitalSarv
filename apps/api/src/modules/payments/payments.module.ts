import { Controller, Get, Header, Logger, Module, Param, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { MockPaymentDriver, ZarinpalPaymentDriver, type PaymentDriver } from './payment-driver.js';
import { PAYMENT_DRIVER, PaymentsService } from './payments.service.js';

export function createPaymentDriver(app: Pick<AppConfig, 'payment' | 'apiPublicUrl'>): PaymentDriver {
  if (app.payment.driver === 'zarinpal') {
    return new ZarinpalPaymentDriver({ merchantId: app.payment.zarinpal.merchantId, sandbox: app.payment.zarinpal.sandbox });
  }
  return new MockPaymentDriver(app.apiPublicUrl);
}

/** Public gateway endpoints (no auth: the gateway redirects the customer's browser here). */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** The mock "bank" page (PAYMENT_DRIVER=mock only). */
  @Get('mock/pay')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  mockPay(@Query('authority') authority?: string) {
    return this.payments.mockPage(authority);
  }

  /** `?Authority=&Status=OK|NOK` → verify → 302 to `${WEB_PUBLIC_URL}/app/pay/return?order=…&status=ok|failed`. */
  @Get(':driver/callback')
  @Redirect()
  async callback(@Param('driver') driver: string, @Query('Authority') authority?: string, @Query('Status') status?: string) {
    return { url: await this.payments.handleCallback(driver, authority, status), statusCode: 302 };
  }
}

@Module({
  imports: [RulesModule, CampaignsModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        const driver = createPaymentDriver(app);
        const sandbox = app.payment.driver === 'zarinpal' && app.payment.zarinpal.sandbox ? ' (sandbox)' : '';
        new Logger('Payments').log(`payment driver: ${driver.name}${sandbox}`);
        return driver;
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
