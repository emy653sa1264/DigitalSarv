import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt, randomUUID } from 'node:crypto';
import type { AuthUser, JwtPayload } from '../../common/auth/auth-user.js';
import { REDIS_KEYS } from '../../common/constants.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { normalizePhone, toAsciiDigits } from '../../common/utils/phone.js';
import type { AppConfig } from '../../config/configuration.js';
import { SmsService } from '../sms/sms.module.js';
import { UsersService } from '../users/users.service.js';

export const OTP_TTL = 120;
export const OTP_MAX_TRIES = 5;
export const OTP_RATE_LIMIT = 5;
export const OTP_RATE_WINDOW = 600;

@Injectable()
export class AuthService {
  private readonly app: AppConfig;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    config: ConfigService,
    private readonly sms: SmsService,
  ) {
    this.app = config.getOrThrow<AppConfig>('app');
  }

  private phoneOrThrow(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    return phone;
  }

  async requestOtp(rawPhone: string) {
    const phone = this.phoneOrThrow(rawPhone);
    const r = this.redis.client;
    const count = await this.bump(REDIS_KEYS.otpRate(phone), OTP_RATE_WINDOW);
    if (count > OTP_RATE_LIMIT) {
      throw new HttpException(
        'تعداد درخواست کد بیش از حد مجاز است؛ چند دقیقه دیگر دوباره تلاش کنید',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = String(randomInt(1000, 10000));
    await r.multi().set(REDIS_KEYS.otp(phone), code, 'EX', OTP_TTL).del(REDIS_KEYS.otpTries(phone)).exec();
    try {
      await this.sms.sendOtp(phone, code);
    } catch (err) {
      // a code the user never received must not stay valid
      await r.del(REDIS_KEYS.otp(phone));
      this.logger.error(`OTP SMS to ${phone} failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ارسال پیامک کد تأیید ناموفق بود؛ چند لحظه دیگر دوباره تلاش کنید');
    }
    // devCode is only ever exposed outside production (see AppConfig.otpDevCode)
    return { ok: true as const, expiresIn: OTP_TTL, ...(this.app.otpDevCode ? { devCode: code } : {}) };
  }

  /** Atomic counter with a window: `SET key 0 EX ttl NX` + `INCR` in one MULTI (the TTL is set exactly once). */
  private async bump(key: string, ttl: number): Promise<number> {
    const res = await this.redis.client.multi().set(key, '0', 'EX', ttl, 'NX').incr(key).exec();
    const [err, n] = res?.[1] ?? [new Error('redis transaction aborted'), 0];
    if (err) throw err;
    return Number(n);
  }

  async verifyOtp(rawPhone: string, rawCode: string) {
    const phone = this.phoneOrThrow(rawPhone);
    const code = toAsciiDigits(rawCode).trim();
    const r = this.redis.client;
    const stored = await r.get(REDIS_KEYS.otp(phone));
    if (!stored) throw new BadRequestException('کد تأیید منقضی شده است؛ دوباره درخواست کد دهید');

    // count the attempt atomically BEFORE comparing, so parallel guesses can never exceed OTP_MAX_TRIES
    const tries = await this.bump(REDIS_KEYS.otpTries(phone), OTP_TTL);
    if (tries > OTP_MAX_TRIES) {
      await r.del(REDIS_KEYS.otp(phone));
      throw new HttpException('تعداد تلاش‌های ناموفق زیاد است؛ دوباره درخواست کد دهید', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (stored !== code) {
      if (tries >= OTP_MAX_TRIES) await r.del(REDIS_KEYS.otp(phone));
      throw new BadRequestException('کد تأیید نادرست است');
    }
    // single use: only the request that actually deletes the code gets a token
    const consumed = await r.del(REDIS_KEYS.otp(phone));
    await r.del(REDIS_KEYS.otpTries(phone));
    if (!consumed) throw new BadRequestException('کد تأیید منقضی شده است؛ دوباره درخواست کد دهید');

    const user = await this.users.findOrCreateByPhone(phone);
    const payload: Omit<JwtPayload, 'jti'> = { sub: user.id, role: user.role, phone: user.phone };
    const accessToken = await this.jwt.signAsync(payload, { jwtid: randomUUID() });
    return { accessToken, user };
  }

  me(user: AuthUser) {
    return this.users.get(user.id).catch(() => {
      throw new UnauthorizedException('حساب کاربری یافت نشد');
    });
  }

  async logout(user: AuthUser) {
    const ttl = user.exp ? user.exp - Math.floor(Date.now() / 1000) : 7 * 86400;
    if (ttl > 0) await this.redis.client.set(REDIS_KEYS.jwtDeny(user.jti), '1', 'EX', ttl);
    return { ok: true as const };
  }
}
