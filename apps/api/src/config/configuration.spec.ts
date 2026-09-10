import { loadAppConfig } from './configuration.js';

/** The minimum a production deployment must provide. */
const PROD = {
  NODE_ENV: 'production',
  JWT_SECRET: 's3cret',
  MONGO_URI: 'mongodb://mongo:27017/digital_sarv',
  REDIS_URL: 'redis://redis:6379',
  WEB_PUBLIC_URL: 'https://sarv.example',
  API_PUBLIC_URL: 'https://sarv.example',
  PAYMENT_DRIVER: 'zarinpal',
  ZARINPAL_MERCHANT_ID: '00000000-0000-0000-0000-000000000000',
};

describe('loadAppConfig', () => {
  it('uses the dev JWT fallback only when NODE_ENV is explicitly development or test', () => {
    expect(loadAppConfig({ NODE_ENV: 'development' }).jwtSecret).toBeTruthy();
    expect(loadAppConfig({ NODE_ENV: 'test' }).jwtSecret).toBeTruthy();
    expect(() => loadAppConfig({ ...PROD, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadAppConfig({ NODE_ENV: 'staging' })).toThrow(/JWT_SECRET/);
    expect(() => loadAppConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadAppConfig({ ...PROD, JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
    expect(loadAppConfig(PROD).jwtSecret).toBe('s3cret');
  });

  it('exposes devCode only with explicit OTP_DEV_CODE=1 and never in production', () => {
    expect(loadAppConfig({ NODE_ENV: 'development' }).otpDevCode).toBe(false);
    expect(loadAppConfig({ NODE_ENV: 'development', OTP_DEV_CODE: 'true' }).otpDevCode).toBe(false);
    expect(loadAppConfig({ NODE_ENV: 'development', OTP_DEV_CODE: '1' }).otpDevCode).toBe(true);
    expect(loadAppConfig({ ...PROD, OTP_DEV_CODE: '1' }).otpDevCode).toBe(false);
  });

  it('fails fast in production when a required variable is missing, listing every problem', () => {
    for (const key of ['MONGO_URI', 'REDIS_URL', 'WEB_PUBLIC_URL', 'API_PUBLIC_URL'] as const) {
      expect(() => loadAppConfig({ ...PROD, [key]: '' })).toThrow(new RegExp(key));
    }
    try {
      loadAppConfig({ NODE_ENV: 'production' });
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      for (const key of ['JWT_SECRET', 'MONGO_URI', 'REDIS_URL', 'WEB_PUBLIC_URL', 'API_PUBLIC_URL', 'PAYMENT_DRIVER=mock']) {
        expect(msg).toContain(key);
      }
    }
  });

  it('development works with no configuration at all (dev defaults)', () => {
    const c = loadAppConfig({ NODE_ENV: 'development' });
    expect(c).toMatchObject({
      webPublicUrl: 'http://localhost:5173',
      apiPublicUrl: 'http://localhost:3000',
      payment: { driver: 'mock', timeoutMinutes: 30 },
      storage: { driver: 'local', uploadDir: './uploads', maxMb: 50, retentionDays: 30 },
      sms: { driver: 'log' },
      adminPhones: [],
    });
    expect(c.throttle.limit).toBeGreaterThanOrEqual(1000);
  });

  it('TRUST_PROXY: hop count (default 1), true/false or a validated list of IPs/CIDRs', () => {
    expect(loadAppConfig(PROD).trustProxy).toBe(1);
    expect(loadAppConfig({ ...PROD, TRUST_PROXY: '2' }).trustProxy).toBe(2); // Caddy/CDN + nginx
    expect(loadAppConfig({ ...PROD, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadAppConfig({ ...PROD, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadAppConfig({ ...PROD, TRUST_PROXY: '172.16.0.0/12, 10.0.0.1, loopback, ::1, fd00::/8, 10.0.0.0/255.0.0.0' }).trustProxy).toEqual([
      '172.16.0.0/12', '10.0.0.1', 'loopback', '::1', 'fd00::/8', '10.0.0.0/255.0.0.0',
    ]);
    for (const bad of ['yes', '10.0.0.0/33', 'example.com', '1.2.3', '-1']) {
      expect(() => loadAppConfig({ ...PROD, TRUST_PROXY: bad })).toThrow(/TRUST_PROXY/);
    }
  });

  it('mock payments are rejected in production unless PAYMENT_ALLOW_MOCK=1', () => {
    expect(() => loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'mock' })).toThrow(/PAYMENT_DRIVER=mock/);
    expect(loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'mock', PAYMENT_ALLOW_MOCK: '1' }).payment.driver).toBe('mock');
    expect(() => loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'paypal' })).toThrow(/PAYMENT_DRIVER must be one of/);
  });

  it('provider drivers require their credentials', () => {
    expect(() => loadAppConfig({ ...PROD, ZARINPAL_MERCHANT_ID: '' })).toThrow(/ZARINPAL_MERCHANT_ID/);
    expect(() => loadAppConfig({ NODE_ENV: 'development', SMS_DRIVER: 'kavenegar' })).toThrow(/SMS_API_KEY/);
    expect(loadAppConfig({ NODE_ENV: 'development', SMS_DRIVER: 'kavenegar', SMS_API_KEY: 'k' }).sms.driver).toBe('kavenegar');
  });

  it('normalizes URLs, CORS origins and admin phones; rejects garbage', () => {
    const c = loadAppConfig({
      ...PROD,
      WEB_PUBLIC_URL: 'https://sarv.example/',
      CORS_ORIGIN: 'https://sarv.example/, https://admin.sarv.example',
      ADMIN_PHONES: '0912 000 0000, +989121234567',
      ZARINPAL_SANDBOX: '1',
    });
    expect(c.webPublicUrl).toBe('https://sarv.example');
    expect(c.corsOrigin).toEqual(['https://sarv.example', 'https://admin.sarv.example']);
    expect(c.adminPhones).toEqual(['09120000000', '09121234567']);
    expect(c.payment.zarinpal.sandbox).toBe(true);
    expect(c.throttle).toMatchObject({ limit: 600, authLimit: 30 });
    expect(() => loadAppConfig({ ...PROD, ADMIN_PHONES: '123' })).toThrow(/ADMIN_PHONES/);
    expect(() => loadAppConfig({ ...PROD, API_PUBLIC_URL: 'sarv.example' })).toThrow(/API_PUBLIC_URL/);
    expect(() => loadAppConfig({ NODE_ENV: 'development', UPLOAD_MAX_MB: 'lots' })).toThrow(/UPLOAD_MAX_MB/);
  });

  it('web push (VAPID) is optional: both keys or neither; a subject is required in production', () => {
    expect(loadAppConfig({ NODE_ENV: 'development' }).vapid).toBeNull();
    expect(loadAppConfig({ NODE_ENV: 'development', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }).vapid)
      .toEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:dev@localhost' });
    expect(() => loadAppConfig({ NODE_ENV: 'development', VAPID_PUBLIC_KEY: 'pub' })).toThrow(/VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/);
    expect(() => loadAppConfig({ ...PROD, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toThrow(/VAPID_SUBJECT must be set/);
    expect(() => loadAppConfig({ NODE_ENV: 'development', VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'q', VAPID_SUBJECT: 'me' })).toThrow(/VAPID_SUBJECT/);
    expect(loadAppConfig({ ...PROD, VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'q', VAPID_SUBJECT: 'mailto:ops@sarv.example' }).vapid?.subject)
      .toBe('mailto:ops@sarv.example');
  });
});
