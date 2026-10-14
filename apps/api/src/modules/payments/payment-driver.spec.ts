import { MockPaymentDriver, readCallback, tomanToRial, ZarinpalPaymentDriver, ZibalPaymentDriver, type FetchLike } from './payment-driver.js';
import { createPaymentDriver } from './payments.module.js';

const MERCHANT = '1344b5d4-0048-11e8-94db-005056a205be';

/** A fetch stub returning `body` and recording what was sent. */
function fetchReturning(body: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

describe('ZarinpalPaymentDriver (REST v4)', () => {
  const input = { orderId: 'o1', code: '10255', amount: 315000, description: 'پرداخت سفارش 10255', mobile: '09123456789', callbackUrl: 'https://api.sarv.test/api/payments/zarinpal/callback' };

  it('request: posts to sandbox request.json in rial and returns the StartPay URL', async () => {
    const { fetch, calls } = fetchReturning({ data: { code: 100, message: 'Success', authority: 'A0000000000000000000000000000abcdef', fee_type: 'Merchant', fee: 100 }, errors: [] });
    const zp = new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch });
    const res = await zp.request(input);
    expect(calls[0].url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json');
    expect(calls[0].body).toEqual({
      merchant_id: MERCHANT,
      amount: 3_150_000, // toman × 10
      callback_url: input.callbackUrl,
      description: input.description,
      metadata: { mobile: '09123456789', order_id: '10255' },
    });
    expect(res).toEqual({
      authority: 'A0000000000000000000000000000abcdef',
      url: 'https://sandbox.zarinpal.com/pg/StartPay/A0000000000000000000000000000abcdef',
    });
  });

  it('request: production host when sandbox is off; provider errors throw', async () => {
    const good = fetchReturning({ data: { code: 100, authority: 'A1' }, errors: [] });
    const prod = new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: false, fetch: good.fetch });
    expect((await prod.request(input)).url).toBe('https://payment.zarinpal.com/pg/StartPay/A1');
    expect(good.calls[0].url).toBe('https://payment.zarinpal.com/pg/v4/payment/request.json');

    const bad = fetchReturning({ data: [], errors: { code: -9, message: 'The input params invalid, validation error.', validations: [] } }, 400);
    await expect(new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch: bad.fetch }).request(input)).rejects.toThrow(/-9/);
  });

  it('verify: 100 and 101 (already verified) are both success; amount in rial', async () => {
    const v100 = fetchReturning({ data: { code: 100, message: 'Verified', card_hash: 'x', card_pan: '502229******5995', ref_id: 201, fee_type: 'Merchant', fee: 0 }, errors: [] });
    const zp = new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch: v100.fetch });
    await expect(zp.verify({ authority: 'A1', amount: 315000 })).resolves.toEqual({ ok: true, refId: '201', cardPan: '502229******5995' });
    expect(v100.calls[0].url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/verify.json');
    expect(v100.calls[0].body).toEqual({ merchant_id: MERCHANT, amount: 3_150_000, authority: 'A1' });

    const v101 = fetchReturning({ data: { code: 101, message: 'Verified', ref_id: 201 }, errors: [] });
    await expect(new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch: v101.fetch }).verify({ authority: 'A1', amount: 315000 }))
      .resolves.toMatchObject({ ok: true, refId: '201' });
  });

  it('verify: a provider rejection is final, a network error is retryable', async () => {
    const rejected = fetchReturning({ data: [], errors: { code: -51, message: 'Session is not valid, session is not active paid try.' } }, 400);
    await expect(new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch: rejected.fetch }).verify({ authority: 'A1', amount: 1000 }))
      .resolves.toMatchObject({ ok: false, retryable: false, message: expect.stringContaining('-51') });

    const down: FetchLike = async () => { throw new TypeError('fetch failed'); };
    await expect(new ZarinpalPaymentDriver({ merchantId: MERCHANT, sandbox: true, fetch: down }).verify({ authority: 'A1', amount: 1000 }))
      .resolves.toMatchObject({ ok: false, retryable: true });
  });

  it('tomanToRial rounds and multiplies by 10', () => {
    expect(tomanToRial(315000)).toBe(3_150_000);
    expect(tomanToRial(999.6)).toBe(10_000);
  });
});

describe('MockPaymentDriver', () => {
  it('issues MOCK authorities pointing at the API mock page and verifies only its own', async () => {
    const mock = new MockPaymentDriver('http://localhost:3000');
    const { authority, url } = await mock.request();
    expect(authority).toMatch(/^MOCK[0-9A-F]{32}$/);
    expect(url).toBe(`http://localhost:3000/api/payments/mock/pay?authority=${authority}`);
    await expect(mock.verify({ authority })).resolves.toMatchObject({ ok: true, refId: expect.stringMatching(/^\d+$/) });
    await expect(mock.verify({ authority: 'A1' })).resolves.toMatchObject({ ok: false, retryable: false });
  });
});

describe('ZibalPaymentDriver (D16)', () => {
  const input = { orderId: 'o1', code: '10255', amount: 315000, description: 'پرداخت سفارش 10255', mobile: '09123456789', callbackUrl: 'https://api.sarv.test/api/payments/zibal/callback' };

  it('request: merchant, rial amount, callbackUrl and the order code → the start URL', async () => {
    const { fetch, calls } = fetchReturning({ trackId: 15966442233, result: 100, message: 'success' });
    const res = await new ZibalPaymentDriver({ merchant: 'zibal', fetch }).request(input);
    expect(calls[0].url).toBe('https://gateway.zibal.ir/v1/request');
    expect(calls[0].body).toEqual({ merchant: 'zibal', amount: 3_150_000, callbackUrl: input.callbackUrl, orderId: '10255', description: input.description, mobile: '09123456789' });
    expect(res).toEqual({ authority: '15966442233', url: 'https://gateway.zibal.ir/start/15966442233' });
  });
  it('request: any result other than 100 throws', async () => {
    const { fetch } = fetchReturning({ result: 102, message: 'merchant یافت نشد.' });
    await expect(new ZibalPaymentDriver({ merchant: 'x', fetch }).request(input)).rejects.toThrow(/102/);
  });
  it('verify: 100 and 201 (already verified) are paid', async () => {
    const v100 = fetchReturning({ paidAt: '2026-10-15T10:00:00.000', cardNumber: '62741****44', status: 1, amount: 3150000, refNumber: 9876, orderId: '10255', result: 100, message: 'success' });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: v100.fetch }).verify({ authority: '15966442233', amount: 315000 }))
      .resolves.toEqual({ ok: true, refId: '9876', cardPan: '62741****44' });
    expect(v100.calls[0]).toEqual({ url: 'https://gateway.zibal.ir/v1/verify', body: { merchant: 'zibal', trackId: 15966442233 } });
    const v201 = fetchReturning({ result: 201, message: 'قبلا تایید شده', refNumber: 9876 });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: v201.fetch }).verify({ authority: '15966442233', amount: 1 })).resolves.toMatchObject({ ok: true, refId: '9876' });
  });
  it('verify: other results are final; network, timeout, 5xx and non-JSON are retryable; a bad trackId never hits the network', async () => {
    const r202 = fetchReturning({ result: 202, message: 'سفارش پرداخت نشده یا ناموفق بوده است' });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: r202.fetch }).verify({ authority: '1', amount: 1 }))
      .resolves.toEqual({ ok: false, message: expect.stringMatching(/202/), retryable: false });
    const down: FetchLike = async () => { throw new TypeError('fetch failed'); };
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: down }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const bad = fetchReturning({ message: 'Bad Gateway' }, 502);
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: bad.fetch }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const html: FetchLike = async () => new Response('<html>', { status: 200 });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: html }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const spy = vi.fn(fetchReturning({ result: 100 }).fetch);
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: spy }).verify({ authority: 'MOCK123', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: false });
    expect(spy).not.toHaveBeenCalled();
  });
  it('readCallback maps the Zibal and the Zarinpal/mock query', () => {
    expect(readCallback('zibal', { trackId: '159', success: '1', status: '2', orderId: '10255' })).toEqual({ authority: '159', status: 'OK' });
    expect(readCallback('zibal', { trackId: '159', success: '0', status: '3' })).toEqual({ authority: '159', status: 'NOK' });
    expect(readCallback('zibal', { trackId: ['1', '2'], success: '1' })).toEqual({ authority: undefined, status: 'OK' });
    expect(readCallback('zarinpal', { Authority: 'A1', Status: 'OK' })).toEqual({ authority: 'A1', status: 'OK' });
    expect(readCallback('mock', {})).toEqual({ authority: undefined, status: undefined });
  });
  it('createPaymentDriver builds the Zibal driver', () => {
    const d = createPaymentDriver({ apiPublicUrl: 'https://api.test', payment: { driver: 'zibal', timeoutMinutes: 30, zarinpal: { merchantId: '', sandbox: false }, zibal: { merchant: 'zibal' } } });
    expect(d.name).toBe('zibal');
  });
});
