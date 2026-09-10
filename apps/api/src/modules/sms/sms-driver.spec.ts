import { NotificationsService } from '../notifications/notifications.service.js';
import { KavenegarSmsDriver, LogSmsDriver, type FetchLike } from './sms-driver.js';

function fetchReturning(body: unknown, status = 200) {
  const calls: { url: string; params: URLSearchParams }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, params: new URLSearchParams(String(init?.body)) });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

const OK = { return: { status: 200, message: 'تایید شد' }, entries: [{ messageid: 1 }] };

describe('KavenegarSmsDriver', () => {
  it('OTP goes through verify/lookup with the template', async () => {
    const { fetch, calls } = fetchReturning(OK);
    await new KavenegarSmsDriver({ apiKey: 'KEY', otpTemplate: 'sarv-otp', fetch }).sendOtp('09123456789', '4821');
    expect(calls[0].url).toBe('https://api.kavenegar.com/v1/KEY/verify/lookup.json');
    expect(Object.fromEntries(calls[0].params)).toEqual({ receptor: '09123456789', token: '4821', template: 'sarv-otp' });
  });

  it('without a template the OTP and notifications use sms/send (with the sender line)', async () => {
    const { fetch, calls } = fetchReturning(OK);
    const kn = new KavenegarSmsDriver({ apiKey: 'KEY', sender: '10004346', fetch });
    await kn.sendOtp('09123456789', '4821');
    await kn.send('09123456789', 'سفارش شما ثبت شد.');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.kavenegar.com/v1/KEY/sms/send.json',
      'https://api.kavenegar.com/v1/KEY/sms/send.json',
    ]);
    expect(calls[0].params.get('message')).toContain('4821');
    expect(Object.fromEntries(calls[1].params)).toEqual({ receptor: '09123456789', message: 'سفارش شما ثبت شد.', sender: '10004346' });
  });

  it('throws on a provider error status', async () => {
    const { fetch } = fetchReturning({ return: { status: 418, message: 'اعتبار حساب شما کافی نیست' }, entries: null }, 418);
    await expect(new KavenegarSmsDriver({ apiKey: 'KEY', fetch }).send('09123456789', 'x')).rejects.toThrow(/418/);
  });
});

describe('LogSmsDriver / notification text', () => {
  it('log driver never throws', async () => {
    await expect(new LogSmsDriver().sendOtp('09123456789', '1234')).resolves.toBeUndefined();
  });

  it('notification SMS carries the order code in Persian digits', () => {
    expect(NotificationsService.smsText('سفارش شما ثبت شد.', '10255')).toBe('دیجیتال سرو — سفارش ۱۰۲۵۵: سفارش شما ثبت شد.');
  });
});
