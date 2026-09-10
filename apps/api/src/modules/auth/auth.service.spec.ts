import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import { REDIS_KEYS } from '../../common/constants.js';
import type { SmsService } from '../sms/sms.module.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService, OTP_MAX_TRIES, OTP_RATE_LIMIT, OTP_RATE_WINDOW, OTP_TTL } from './auth.service.js';

const PHONE = '09123456789';
const WRONG_CODE = 'کد تأیید نادرست است';

function make(otpDevCode = true, smsFails = false) {
  const client = new FakeRedis();
  const users = { findOrCreateByPhone: vi.fn(async (phone: string) => ({ id: 'u1', role: 'customer', phone })) };
  const jwt = { signAsync: vi.fn(async () => 'token') };
  const config = { getOrThrow: () => ({ otpDevCode, isProduction: false }) };
  const sms = {
    sendOtp: vi.fn(async () => {
      if (smsFails) throw new Error('provider down');
    }),
  };
  const svc = new AuthService(
    fakeRedisService(client),
    jwt as unknown as JwtService,
    users as unknown as UsersService,
    config as unknown as ConfigService,
    sms as unknown as SmsService,
  );
  return { svc, client, sms };
}

const status = (r: PromiseSettledResult<unknown>) =>
  r.status === 'rejected' && r.reason instanceof HttpException ? r.reason.getStatus() : 0;
const message = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason as Error).message : 'ok');

describe('AuthService OTP', () => {
  it('returns devCode only when the config opts in', async () => {
    expect((await make(true).svc.requestOtp(PHONE)).devCode).toMatch(/^\d{4}$/);
    expect(await make(false).svc.requestOtp(PHONE)).not.toHaveProperty('devCode');
  });

  it('sends the code through the SMS driver', async () => {
    const { svc, sms } = make(true);
    const { devCode } = await svc.requestOtp(PHONE);
    expect(sms.sendOtp).toHaveBeenCalledWith(PHONE, devCode);
  });

  it('an SMS failure returns 503 and burns the code (never valid unless delivered)', async () => {
    const { svc, client } = make(true, true);
    const [r] = await Promise.allSettled([svc.requestOtp(PHONE)]);
    expect(status(r)).toBe(503);
    expect(client.getSync(REDIS_KEYS.otp(PHONE))).toBeNull();
  });

  it('rate limit: the window TTL is set with the counter and request 6 is rejected with 429', async () => {
    const { svc, client } = make();
    for (let i = 0; i < OTP_RATE_LIMIT; i++) await svc.requestOtp(PHONE);
    const ttl = client.ttl(REDIS_KEYS.otpRate(PHONE));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(OTP_RATE_WINDOW);
    const [sixth] = await Promise.allSettled([svc.requestOtp(PHONE)]);
    expect(status(sixth)).toBe(429);
  });

  it('parallel requests never slip past the rate limit', async () => {
    const { svc } = make();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => svc.requestOtp(PHONE)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(OTP_RATE_LIMIT);
  });

  it('60 parallel wrong guesses: at most 5 are compared, the rest get 429 and the code is burned', async () => {
    const { svc, client } = make();
    const { devCode } = await svc.requestOtp(PHONE);
    const wrong = devCode === '1111' ? '2222' : '1111';
    const results = await Promise.allSettled(Array.from({ length: 60 }, () => svc.verifyOtp(PHONE, wrong)));
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const evaluated = results.filter((r) => message(r) === WRONG_CODE).length;
    expect(evaluated).toBeGreaterThan(0);
    expect(evaluated).toBeLessThanOrEqual(OTP_MAX_TRIES);
    expect(results.filter((r) => status(r) === 429).length).toBeGreaterThanOrEqual(60 - OTP_MAX_TRIES - 1);
    const tries = client.ttl(REDIS_KEYS.otpTries(PHONE));
    expect(tries === -2 || (tries > 0 && tries <= OTP_TTL)).toBe(true);
    // even the right code no longer works
    await expect(svc.verifyOtp(PHONE, devCode!)).rejects.toThrow();
  });

  it('the attempt after 5 wrong ones is rejected even with the right code', async () => {
    const { svc } = make();
    const { devCode } = await svc.requestOtp(PHONE);
    const wrong = devCode === '1111' ? '2222' : '1111';
    for (let i = 0; i < OTP_MAX_TRIES; i++) await expect(svc.verifyOtp(PHONE, wrong)).rejects.toThrow(WRONG_CODE);
    await expect(svc.verifyOtp(PHONE, devCode!)).rejects.toThrow();
  });

  it('a correct code logs in once (single use, also under parallel verifies)', async () => {
    const { svc } = make();
    const { devCode } = await svc.requestOtp(PHONE);
    const results = await Promise.allSettled([svc.verifyOtp(PHONE, devCode!), svc.verifyOtp(PHONE, devCode!)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(svc.verifyOtp(PHONE, devCode!)).rejects.toThrow();
  });
});
