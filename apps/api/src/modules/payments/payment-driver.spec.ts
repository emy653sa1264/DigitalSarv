import { MockPaymentDriver, tomanToRial, ZarinpalPaymentDriver, type FetchLike } from './payment-driver.js';

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
