import { isIP } from 'node:net';
import { PAYMENT_DRIVERS, type PaymentDriverName } from '../common/constants.js';
import { normalizePhone } from '../common/utils/phone.js';

export const SMS_DRIVERS = ['log', 'kavenegar'] as const;
export type SmsDriverName = (typeof SMS_DRIVERS)[number];
export const STORAGE_DRIVERS = ['local'] as const;
export type StorageDriverName = (typeof STORAGE_DRIVERS)[number];

export interface ThrottleConfig {
  /** Window in seconds / max requests per IP in the window; `limit` 0 disables the throttler. */
  ttl: number;
  limit: number;
  /** Stricter limit for `/api/auth/*`. */
  authTtl: number;
  authLimit: number;
  /** Per-user limit for `POST /api/uploads` (file writes + PDF parsing are the expensive route). */
  uploadTtl: number;
  uploadLimit: number;
}

/** Express `trust proxy`: hop count, `true`/`false`, or trusted addresses/CIDRs/presets. */
export type TrustProxy = number | boolean | string[];

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  mongoUri: string;
  redisUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string[];
  /** Expose the OTP as `devCode` in `/auth/otp/request` (explicit `OTP_DEV_CODE=1`, never in production). */
  otpDevCode: boolean;
  /** Public base URL of the web app (no trailing slash), e.g. https://sarv.ir — payment return page. */
  webPublicUrl: string;
  /** Public base URL of the API origin (no trailing slash, without `/api`) — payment callbacks, mock gateway. */
  apiPublicUrl: string;
  bodyLimit: string;
  /** Reverse-proxy hops in front of the API (`TRUST_PROXY`): 1 = nginx only, 2 = Caddy/CDN + nginx. */
  trustProxy: TrustProxy;
  throttle: ThrottleConfig;
  payment: {
    driver: PaymentDriverName;
    /** Unpaid gateway orders are cancelled this many minutes after the last payment attempt. */
    timeoutMinutes: number;
    zarinpal: { merchantId: string; sandbox: boolean };
  };
  storage: {
    driver: StorageDriverName;
    uploadDir: string;
    maxMb: number;
    /** Files are deleted this many days after their order was delivered/cancelled. */
    retentionDays: number;
  };
  /** SMS is only used for the login OTP (v3.3: order events are in-app + web push). */
  sms: { driver: SmsDriverName; apiKey: string; sender: string; otpTemplate: string };
  /** Web Push (VAPID) keys; `null` = order notifications are in-app only. */
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  /** Normalized phones upserted as admins on boot. */
  adminPhones: string[];
}

const DEV_JWT_SECRET = 'dev-secret-digital-sarv';

const trimSlash = (s: string) => s.trim().replace(/\/+$/, '');

function num(env: NodeJS.ProcessEnv, key: string, fallback: number, errors: string[], min = 0): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    errors.push(`${key} must be a number ≥ ${min} (got "${raw}")`);
    return fallback;
  }
  return n;
}

function oneOf<T extends string>(env: NodeJS.ProcessEnv, key: string, options: readonly T[], fallback: T, errors: string[]): T {
  const raw = (env[key] ?? '').trim();
  if (!raw) return fallback;
  if (!options.includes(raw as T)) {
    errors.push(`${key} must be one of ${options.join('|')} (got "${raw}")`);
    return fallback;
  }
  return raw as T;
}

function url(env: NodeJS.ProcessEnv, key: string, fallback: string, required: boolean, errors: string[]): string {
  const raw = (env[key] ?? '').trim();
  if (!raw) {
    if (required) errors.push(`${key} must be set`);
    return fallback;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  } catch {
    errors.push(`${key} must be an absolute http(s) URL (got "${raw}")`);
    return fallback;
  }
  return trimSlash(raw);
}

const TRUST_PRESETS = ['loopback', 'linklocal', 'uniquelocal'];

/** One `trust proxy` list entry as Express/proxy-addr accepts it: an IP, IP/prefix, IP/netmask or preset. */
function isTrustEntry(entry: string): boolean {
  if (TRUST_PRESETS.includes(entry)) return true;
  const [addr, mask, ...rest] = entry.split('/');
  const family = isIP(addr);
  if (!family || rest.length) return false;
  if (mask === undefined) return true;
  if (/^\d+$/.test(mask)) return Number(mask) <= (family === 4 ? 32 : 128);
  return family === 4 && isIP(mask) === 4;
}

/**
 * `TRUST_PROXY` (Express semantics): a hop count (default 1 = the bundled nginx; 2 = Caddy/host proxy/
 * CDN + nginx), `true`/`false`, or comma-separated trusted IPs/CIDRs/presets.
 */
function trustProxy(env: NodeJS.ProcessEnv, errors: string[]): TrustProxy {
  const raw = (env.TRUST_PROXY ?? '').trim();
  if (!raw) return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length || !list.every(isTrustEntry)) {
    errors.push(`TRUST_PROXY must be a hop count (1 = nginx only, 2 = Caddy/CDN + nginx), true/false, or comma-separated IPs/CIDRs (got "${raw}")`);
    return 1;
  }
  return list;
}

/**
 * Reads and validates the environment. Throws one error listing every problem, so a misconfigured
 * deployment fails fast at boot instead of at the first payment/SMS.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  // the built-in secret is only acceptable when NODE_ENV explicitly says development/test
  const devFallback = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  const jwtSecret = env.JWT_SECRET || (devFallback ? DEV_JWT_SECRET : '');
  if (!jwtSecret) errors.push(`JWT_SECRET must be set (NODE_ENV=${env.NODE_ENV ?? '<unset>'})`);

  if (isProduction) {
    for (const key of ['MONGO_URI', 'REDIS_URL'] as const) if (!env[key]?.trim()) errors.push(`${key} must be set`);
  }
  const webPublicUrl = url(env, 'WEB_PUBLIC_URL', 'http://localhost:5173', isProduction, errors);
  const port = num(env, 'PORT', 3000, errors, 1);
  const apiPublicUrl = url(env, 'API_PUBLIC_URL', `http://localhost:${port}`, isProduction, errors);

  const paymentDriver = oneOf(env, 'PAYMENT_DRIVER', PAYMENT_DRIVERS, 'mock', errors);
  if (isProduction && paymentDriver === 'mock' && env.PAYMENT_ALLOW_MOCK !== '1') {
    errors.push('PAYMENT_DRIVER=mock is not allowed in production (set PAYMENT_DRIVER=zarinpal, or PAYMENT_ALLOW_MOCK=1 for a staging box)');
  }
  const merchantId = (env.ZARINPAL_MERCHANT_ID ?? '').trim();
  if (paymentDriver === 'zarinpal' && !merchantId) errors.push('ZARINPAL_MERCHANT_ID must be set when PAYMENT_DRIVER=zarinpal');

  const smsDriver = oneOf(env, 'SMS_DRIVER', SMS_DRIVERS, 'log', errors);
  const smsApiKey = (env.SMS_API_KEY ?? '').trim();
  if (smsDriver === 'kavenegar' && !smsApiKey) errors.push('SMS_API_KEY must be set when SMS_DRIVER=kavenegar');

  const adminPhones: string[] = [];
  for (const raw of (env.ADMIN_PHONES ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const phone = normalizePhone(raw);
    if (phone) adminPhones.push(phone);
    else errors.push(`ADMIN_PHONES contains an invalid mobile number: "${raw}"`);
  }

  // generous limits outside production so local dev / e2e never trip them
  const throttle: ThrottleConfig = {
    ttl: num(env, 'THROTTLE_TTL', 60, errors, 1),
    limit: num(env, 'THROTTLE_LIMIT', isProduction ? 600 : 10_000, errors),
    authTtl: num(env, 'THROTTLE_AUTH_TTL', 60, errors, 1),
    authLimit: num(env, 'THROTTLE_AUTH_LIMIT', isProduction ? 30 : 1_000, errors),
    uploadTtl: num(env, 'THROTTLE_UPLOAD_TTL', 60, errors, 1),
    uploadLimit: num(env, 'THROTTLE_UPLOAD_LIMIT', isProduction ? 20 : 1_000, errors),
  };

  const bodyLimit = (env.BODY_LIMIT ?? '').trim() || '1mb';
  if (!/^\d+(b|kb|mb)$/i.test(bodyLimit)) errors.push(`BODY_LIMIT must look like 1mb / 512kb (got "${bodyLimit}")`);

  const config: AppConfig = {
    nodeEnv,
    isProduction,
    port,
    mongoUri: env.MONGO_URI?.trim() || 'mongodb://localhost:27017/digital_sarv',
    redisUrl: env.REDIS_URL?.trim() || 'redis://localhost:6379',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '7d',
    corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((s) => trimSlash(s))
      .filter(Boolean),
    // OTP_DEV_CODE is ignored in production, whatever its value
    otpDevCode: !isProduction && env.OTP_DEV_CODE === '1',
    webPublicUrl,
    apiPublicUrl,
    bodyLimit,
    trustProxy: trustProxy(env, errors),
    throttle,
    payment: {
      driver: paymentDriver,
      timeoutMinutes: num(env, 'PAYMENT_TIMEOUT_MIN', 30, errors, 1),
      zarinpal: { merchantId, sandbox: env.ZARINPAL_SANDBOX === '1' },
    },
    storage: {
      driver: oneOf(env, 'STORAGE_DRIVER', STORAGE_DRIVERS, 'local', errors),
      uploadDir: (env.UPLOAD_DIR ?? '').trim() || './uploads',
      maxMb: num(env, 'UPLOAD_MAX_MB', 50, errors, 1),
      retentionDays: num(env, 'UPLOAD_RETENTION_DAYS', 30, errors, 1),
    },
    sms: {
      driver: smsDriver,
      apiKey: smsApiKey,
      sender: (env.SMS_SENDER ?? '').trim(),
      otpTemplate: (env.SMS_OTP_TEMPLATE ?? '').trim(),
    },
    vapid: vapidConfig(env, isProduction, errors),
    adminPhones: [...new Set(adminPhones)],
  };

  if (errors.length) {
    throw new Error(`Invalid configuration (NODE_ENV=${env.NODE_ENV ?? '<unset>'}):\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}

export default () => ({ app: loadAppConfig() });

/**
 * Web Push (VAPID): both keys or neither (neither = in-app notifications only); `VAPID_SUBJECT` must be a
 * `mailto:` or `https://` URL and is required in production when the keys are set.
 */
function vapidConfig(env: NodeJS.ProcessEnv, isProduction: boolean, errors: string[]): AppConfig['vapid'] {
  const publicKey = (env.VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? '').trim();
  const subject = (env.VAPID_SUBJECT ?? '').trim();
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey) {
    errors.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together (or both left empty)');
    return null;
  }
  if (subject && !/^(mailto:\S+|https:\/\/\S+)$/.test(subject)) {
    errors.push(`VAPID_SUBJECT must be a mailto: or https:// URL (got "${subject}")`);
    return null;
  }
  if (!subject && isProduction) {
    errors.push('VAPID_SUBJECT must be set when the VAPID keys are set');
    return null;
  }
  return { publicKey, privateKey, subject: subject || 'mailto:dev@localhost' };
}
