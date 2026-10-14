import { randomBytes, randomInt } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { PaymentDriverName } from '../../common/constants.js';

export interface PaymentRequestInput {
  orderId: string;
  code: string;
  /** Toman. Drivers convert to the provider's unit. */
  amount: number;
  description: string;
  mobile?: string;
  callbackUrl: string;
}

export interface PaymentRequestResult {
  authority: string;
  /** Where to send the customer to pay. */
  url: string;
}

export type PaymentVerifyResult =
  | { ok: true; refId: string; cardPan?: string }
  /** `retryable`: the provider could not be reached — the payment may still be verified later. */
  | { ok: false; message: string; retryable: boolean; /** the provider captured a different amount than requested (rial) */ mismatch?: { paidRial: number } };

/** One payment gateway (`PAYMENT_DRIVER`). */
export interface PaymentDriver {
  readonly name: PaymentDriverName;
  request(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  /** Must be idempotent: verifying an already-verified authority succeeds again. */
  verify(input: { authority: string; amount: number }): Promise<PaymentVerifyResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Dev/staging gateway: the "bank" is an HTML page served by the API itself. */
export class MockPaymentDriver implements PaymentDriver {
  readonly name = 'mock' as const;

  constructor(private readonly apiPublicUrl: string) {}

  async request(): Promise<PaymentRequestResult> {
    const authority = 'MOCK' + randomBytes(16).toString('hex').toUpperCase();
    return { authority, url: `${this.apiPublicUrl}/api/payments/mock/pay?authority=${authority}` };
  }

  async verify({ authority }: { authority: string }): Promise<PaymentVerifyResult> {
    if (!/^MOCK[0-9A-F]{32}$/.test(authority)) return { ok: false, message: 'authority نامعتبر است', retryable: false };
    return { ok: true, refId: String(randomInt(100_000_000, 999_999_999)), cardPan: '6037-99**-****-1234' };
  }
}

/** Toman → rial (Zarinpal's default currency). */
export const tomanToRial = (toman: number) => Math.round(toman) * 10;

interface ZarinpalBody {
  data?: { code?: number; message?: string; authority?: string; ref_id?: number | string; card_pan?: string } | unknown[];
  errors?: { code?: number; message?: string } | unknown[];
}

export interface ZarinpalOptions {
  merchantId: string;
  sandbox: boolean;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** Zarinpal REST v4: `payment/request.json` → StartPay → callback → `payment/verify.json`. */
export class ZarinpalPaymentDriver implements PaymentDriver {
  readonly name = 'zarinpal' as const;
  readonly baseUrl: string;
  private readonly fetch: FetchLike;

  constructor(private readonly opts: ZarinpalOptions) {
    this.baseUrl = opts.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
    this.fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<ZarinpalBody> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant_id: this.opts.merchantId, ...payload }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
    });
    try {
      return (await res.json()) as ZarinpalBody;
    } catch {
      throw new Error(`zarinpal ${path}: HTTP ${res.status} (non-JSON response)`);
    }
  }

  private static data(body: ZarinpalBody) {
    return body.data && !Array.isArray(body.data) ? body.data : {};
  }

  private static error(body: ZarinpalBody): string {
    const e = body.errors && !Array.isArray(body.errors) ? body.errors : {};
    const d = ZarinpalPaymentDriver.data(body);
    return `${e.code ?? d.code ?? '?'} ${e.message ?? d.message ?? ''}`.trim();
  }

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const body = await this.post('/pg/v4/payment/request.json', {
      amount: tomanToRial(input.amount),
      callback_url: input.callbackUrl,
      description: input.description,
      metadata: { ...(input.mobile ? { mobile: input.mobile } : {}), order_id: input.code },
    });
    const d = ZarinpalPaymentDriver.data(body);
    if (d.code !== 100 || !d.authority) throw new Error(`zarinpal request failed: ${ZarinpalPaymentDriver.error(body)}`);
    return { authority: d.authority, url: `${this.baseUrl}/pg/StartPay/${d.authority}` };
  }

  async verify({ authority, amount }: { authority: string; amount: number }): Promise<PaymentVerifyResult> {
    let body: ZarinpalBody;
    try {
      body = await this.post('/pg/v4/payment/verify.json', { amount: tomanToRial(amount), authority });
    } catch (err) {
      return { ok: false, message: (err as Error).message, retryable: true };
    }
    const d = ZarinpalPaymentDriver.data(body);
    // 100 = verified now, 101 = already verified before (idempotent success)
    if ((d.code === 100 || d.code === 101) && d.ref_id !== undefined) {
      return { ok: true, refId: String(d.ref_id), ...(d.card_pan ? { cardPan: d.card_pan } : {}) };
    }
    return { ok: false, message: ZarinpalPaymentDriver.error(body), retryable: false };
  }
}

interface ZibalBody { amount?: number | string; result?: number; message?: string; trackId?: number | string; refNumber?: number | string | null; cardNumber?: string | null }

export interface ZibalOptions { merchant: string; fetch?: FetchLike; timeoutMs?: number }

/**
 * Zibal (D16): `v1/request` → `start/<trackId>` → callback (`trackId`, `success`) → `v1/verify`. Amounts in rial.
 * `result` 100 = verified, 201 = already verified (idempotent success); anything else is a definitive failure.
 */
export class ZibalPaymentDriver implements PaymentDriver {
  readonly name = 'zibal' as const;
  readonly baseUrl = 'https://gateway.zibal.ir';
  private readonly fetch: FetchLike;

  constructor(private readonly opts: ZibalOptions) {
    this.fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<ZibalBody> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: this.opts.merchant, ...payload }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
    });
    if (res.status >= 500) throw new Error(`zibal ${path}: HTTP ${res.status}`);
    try {
      return (await res.json()) as ZibalBody;
    } catch {
      throw new Error(`zibal ${path}: HTTP ${res.status} (non-JSON response)`);
    }
  }

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const body = await this.post('/v1/request', {
      amount: tomanToRial(input.amount),
      callbackUrl: input.callbackUrl,
      orderId: input.code,
      description: input.description,
      ...(input.mobile ? { mobile: input.mobile } : {}),
    });
    if (body.result !== 100 || body.trackId === undefined || body.trackId === null) {
      throw new Error(`zibal request failed: ${body.result ?? '?'} ${body.message ?? ''}`.trim());
    }
    const trackId = String(body.trackId);
    return { authority: trackId, url: `${this.baseUrl}/start/${trackId}` };
  }

  async verify({ authority, amount }: { authority: string; amount: number }): Promise<PaymentVerifyResult> {
    if (!/^\d{1,20}$/.test(authority)) return { ok: false, message: 'trackId نامعتبر است', retryable: false };
    let body: ZibalBody;
    try {
      body = await this.post('/v1/verify', { trackId: Number(authority) });
    } catch (err) {
      return { ok: false, message: (err as Error).message, retryable: true };
    }
    if (body.result === 100 || body.result === 201) {
      // 201 may omit the amount; when present it must match what we asked for (never silently pay a mismatch)
      if (body.amount !== undefined && body.amount !== null && (String(body.amount).trim() === '' || !Number.isFinite(Number(body.amount)))) {
        // an unreadable amount is not evidence of a mismatch: retry later instead of crediting NaN → 0
        return { ok: false, message: `zibal returned a non-numeric amount for trackId ${authority}: ${String(body.amount)}`, retryable: true };
      }
      if (body.amount !== undefined && body.amount !== null && Number(body.amount) !== tomanToRial(amount)) {
        const message = `zibal amount mismatch for trackId ${authority}: provider ${String(body.amount)} rial, expected ${tomanToRial(amount)}`;
        new Logger('ZibalPaymentDriver').error(message);
        return { ok: false, message, retryable: false, mismatch: { paidRial: Number(body.amount) } };
      }
      return { ok: true, refId: String(body.refNumber ?? authority), ...(body.cardNumber ? { cardPan: body.cardNumber } : {}) };
    }
    return { ok: false, message: `${body.result ?? '?'} ${body.message ?? ''}`.trim(), retryable: false };
  }
}

/** The gateway's callback query → `{ authority, status: 'OK' | 'NOK' }` (Zarinpal/mock `Authority`+`Status`, Zibal `trackId`+`success`). */
export function readCallback(driver: string, q: Record<string, unknown>): { authority?: string; status?: string } {
  const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  if (driver === 'zibal') return { authority: one(q.trackId), status: q.success === '1' ? 'OK' : 'NOK' };
  return { authority: one(q.Authority), status: one(q.Status) };
}
