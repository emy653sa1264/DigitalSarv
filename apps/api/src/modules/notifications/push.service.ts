import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import type { AppConfig } from '../../config/configuration.js';

/** Payload the service worker (`public/sw.js`) shows. */
export interface PushMessage { title: string; body: string; url: string; tag: string }
export interface PushTarget { endpoint: string; keys: { p256dh: string; auth: string } }

/**
 * Web Push with the configured VAPID keys (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`).
 * Without keys it is disabled and notifications are in-app only.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private readonly vapid: AppConfig['vapid'];

  constructor(config: ConfigService) {
    this.vapid = config.getOrThrow<AppConfig>('app').vapid;
    this.logger.log(this.vapid ? 'Web Push enabled' : 'Web Push disabled (no VAPID keys) — in-app notifications only');
  }

  get enabled(): boolean {
    return !!this.vapid;
  }

  get publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  /** `gone` when the push service says the subscription no longer exists (404/410); other failures throw. */
  async send(target: PushTarget, message: PushMessage): Promise<'ok' | 'gone'> {
    if (!this.vapid) return 'ok';
    try {
      await webpush.sendNotification(target, JSON.stringify(message), {
        vapidDetails: this.vapid,
        TTL: 24 * 3600,
        timeout: 10_000,
      });
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw err;
    }
  }
}
