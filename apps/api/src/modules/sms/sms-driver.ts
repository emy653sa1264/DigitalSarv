import { Logger } from '@nestjs/common';

/** One SMS provider. Implementations throw on delivery failure (the caller decides whether that matters). */
export interface SmsDriver {
  readonly name: string;
  /** One-time login code — uses the provider's template/verify API when it has one. */
  sendOtp(phone: string, code: string): Promise<void>;
  /** Free-text notification. */
  send(phone: string, text: string): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Dev driver: writes messages to the server log instead of sending them. */
export class LogSmsDriver implements SmsDriver {
  readonly name = 'log';
  private readonly logger = new Logger('SMS');

  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.log(`[otp] → ${phone}: ${code}`);
  }

  async send(phone: string, text: string): Promise<void> {
    this.logger.log(`[sms] → ${phone}: ${text}`);
  }
}

export interface KavenegarOptions {
  apiKey: string;
  /** Sender line; optional (Kavenegar falls back to the account's default line). */
  sender?: string;
  /** Verify/lookup template name for OTP; without it the OTP goes out as a plain message. */
  otpTemplate?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Kavenegar REST API: `verify/lookup.json` for OTP, `sms/send.json` for notifications. */
export class KavenegarSmsDriver implements SmsDriver {
  readonly name = 'kavenegar';
  private readonly fetch: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly opts: KavenegarOptions) {
    this.fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.baseUrl = (opts.baseUrl ?? 'https://api.kavenegar.com/v1').replace(/\/+$/, '');
  }

  private async call(method: string, params: Record<string, string>): Promise<void> {
    const url = `${this.baseUrl}/${encodeURIComponent(this.opts.apiKey)}/${method}.json`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
    });
    let body: { return?: { status?: number; message?: string } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON error page */
    }
    const status = body.return?.status ?? res.status;
    if (!res.ok || status !== 200) {
      throw new Error(`kavenegar ${method} failed: ${status} ${body.return?.message ?? res.statusText}`);
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.opts.otpTemplate) {
      await this.call('verify/lookup', { receptor: phone, token: code, template: this.opts.otpTemplate });
      return;
    }
    await this.send(phone, `کد ورود شما به دیجیتال سرو: ${code}`);
  }

  async send(phone: string, text: string): Promise<void> {
    await this.call('sms/send', { receptor: phone, message: text, ...(this.opts.sender ? { sender: this.opts.sender } : {}) });
  }
}
