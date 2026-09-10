import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureAdmins(this.config.getOrThrow<AppConfig>('app').adminPhones);
  }

  async ensureAdmins(phones: string[]): Promise<number> {
    let changed = 0;
    for (const phone of phones) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await this.users.updateOne(
            { phone },
            {
              $set: { role: 'admin' },
              $unset: { courierId: 1 },
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
    }
    if (phones.length) this.logger.log(`ADMIN_PHONES: ${phones.length} admin(s) ensured (${changed} changed)`);
    return changed;
  }
}
