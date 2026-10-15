import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenVerifier } from '../../common/auth/token-verifier.service.js';
import type { AppConfig } from '../../config/configuration.js';
import { User } from './user.schema.js';
import { makeReferralCode } from './users.service.js';

/** Upserts every `ADMIN_PHONES` number as an admin on boot (first production login, no seed needed). */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService,
    private readonly sessions: TokenVerifier,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureAdmins(this.config.getOrThrow<AppConfig>('app').adminPhones);
  }

  async ensureAdmins(phones: string[]): Promise<number> {
    let changed = 0;
    for (const phone of phones) {
      const before = await this.users.findOne({ phone }, { role: 1, permissions: 1, providerId: 1, courierId: 1 }).lean();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await this.users.updateOne(
            { phone },
            {
              $set: { role: 'admin' },
              // ADMIN_PHONES are always super-admins (v4.1): no permission list, no courier/provider link
              $unset: { courierId: 1, providerId: 1, permissions: 1 },
              $setOnInsert: { phone, name: 'مدیر سیستم', planId: 'bronze', referralCode: makeReferralCode() },
            },
            { upsert: true },
          );
          changed += res.upsertedCount + res.modifiedCount;
          break;
        } catch (err) {
          // two instances inserting the same phone at once: the loser retries as an update
          if ((err as { code?: number }).code !== 11000 || attempt) {
            this.logger.error(`could not ensure admin ${phone}: ${(err as Error).message}`);
            break;
          }
        }
      }
      // the boot changed what this account may do: its older tokens carry a stale role claim (v4.4)
      if (before && (before.role !== 'admin' || before.permissions || before.providerId || before.courierId)) {
        try {
          await this.sessions.revokeUser(String(before._id));
        } catch (err) {
          this.logger.error(`could not revoke sessions of ${phone}: ${(err as Error).message}`);
        }
      }
    }
    if (phones.length) this.logger.log(`ADMIN_PHONES: ${phones.length} admin(s) ensured (${changed} changed)`);
    return changed;
  }
}
