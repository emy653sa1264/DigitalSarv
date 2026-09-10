import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { KavenegarSmsDriver, LogSmsDriver, type SmsDriver } from './sms-driver.js';

export function createSmsDriver(sms: AppConfig['sms']): SmsDriver {
  if (sms.driver === 'kavenegar') {
    return new KavenegarSmsDriver({ apiKey: sms.apiKey, sender: sms.sender || undefined, otpTemplate: sms.otpTemplate || undefined });
  }
  return new LogSmsDriver();
}

/** The configured SMS driver (`SMS_DRIVER=log|kavenegar`). */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  readonly driver: SmsDriver;

  constructor(config: ConfigService) {
    this.driver = createSmsDriver(config.getOrThrow<AppConfig>('app').sms);
    this.logger.log(`SMS driver: ${this.driver.name}`);
  }

  sendOtp(phone: string, code: string): Promise<void> {
    return this.driver.sendOtp(phone, code);
  }

  send(phone: string, text: string): Promise<void> {
    return this.driver.send(phone, text);
  }
}

@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
