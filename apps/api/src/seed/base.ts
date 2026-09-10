import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { infraImports } from '../app.module.js';
import { REDIS_KEYS } from '../common/constants.js';
import { RedisService } from '../common/redis/redis.service.js';
import { addDays, tehranDayStart } from '../common/utils/dates.js';
import { Campaign } from '../modules/campaigns/campaign.schema.js';
import { DEFAULT_PRICES } from '../modules/catalog/catalog.defaults.js';
import { Color } from '../modules/catalog/schemas/color.schema.js';
import { Extra } from '../modules/catalog/schemas/extra.schema.js';
import { Grade } from '../modules/catalog/schemas/grade.schema.js';
import { Plan } from '../modules/catalog/schemas/plan.schema.js';
import { Settings, SETTINGS_ID } from '../modules/catalog/schemas/settings.schema.js';
import { Center } from '../modules/centers/center.schema.js';
import { CmsSection } from '../modules/cms/cms-section.schema.js';
import { NotificationTemplate } from '../modules/notifications/notification-template.schema.js';
import { PricingRule } from '../modules/rules/rule.schema.js';
import { Zone } from '../modules/zones/zone.schema.js';
import { CENTERS, CMS, COLORS, EXTRAS, GRADES, NOTIFICATIONS, PLANS, RULES, SCHOOL_CAMPAIGN, ZONES } from './base-data.js';

/** Infra only (config, Mongo, Redis, models) — no HTTP, no scheduled jobs. */
@Module({ imports: infraImports })
export class SeedModule {}

/**
 * Inserts every missing reference document and never touches existing ones (`$setOnInsert` keyed
 * on a natural key), so it is safe to run on a live production database after every deploy —
 * admin edits survive. Returns the number of documents inserted per collection.
 */
export async function seedBase(app: INestApplicationContext, log = new Logger('Seed:base')): Promise<Record<string, number>> {
  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));

  /** Upserts `docs` keyed on `keys`; returns how many were inserted. */
  async function insertMissing<T>(name: string, keys: string[], docs: Record<string, unknown>[]): Promise<number> {
    if (!docs.length) return 0;
    const res = await model<T>(name).bulkWrite(
      docs.map((doc) => {
        const filter = Object.fromEntries(keys.map((k) => [k, doc[k]]));
        const insert = Object.fromEntries(Object.entries(doc).filter(([k]) => !keys.includes(k)));
        return { updateOne: { filter, update: { $setOnInsert: insert }, upsert: true } };
      }) as never,
      { ordered: false, timestamps: false },
    );
    return res.upsertedCount;
  }

  const todayStart = tehranDayStart();
  const counts: Record<string, number> = {
    plans: await insertMissing<Plan>(Plan.name, ['_id'], PLANS.map((p) => ({ ...p, grad: [...p.grad] }))),
    colors: await insertMissing<Color>(Color.name, ['key'], COLORS),
    extras: await insertMissing<Extra>(Extra.name, ['key'], EXTRAS),
    grades: await insertMissing<Grade>(Grade.name, ['name'], GRADES),
    settings: await insertMissing<Settings>(Settings.name, ['_id'], [{ _id: SETTINGS_ID, prices: { ...DEFAULT_PRICES }, urgentEnabled: true }]),
    cms: await insertMissing<CmsSection>(CmsSection.name, ['key'], CMS.map(([key, label, on], i) => ({ key, label, on, order: i + 1 }))),
    notifications: await insertMissing<NotificationTemplate>(NotificationTemplate.name, ['event', 'channel'], NOTIFICATIONS.map((n) => ({ ...n }))),
    zones: await insertMissing<Zone>(Zone.name, ['name'], ZONES),
    centers: await insertMissing<Center>(Center.name, ['name'], CENTERS),
  };

  // rules have no natural key: only a fresh database gets the prototype's rules
  const Rules = model<PricingRule>(PricingRule.name);
  counts.rules = (await Rules.estimatedDocumentCount()) === 0 ? (await Rules.insertMany(RULES.map((r) => ({ ...r })))).length : 0;

  // the campaign is inserted active only when no other campaign is active (single-active invariant)
  const Campaigns = model<Campaign>(Campaign.name);
  const anyActive = !!(await Campaigns.exists({ active: true }));
  counts.campaigns = await insertMissing<Campaign>(Campaign.name, ['code'], [
    {
      ...SCHOOL_CAMPAIGN,
      services: [...SCHOOL_CAMPAIGN.services],
      startsAt: addDays(todayStart, -21),
      endsAt: addDays(todayStart, 20),
      active: !anyActive,
      stats: { orders: 0, books: 0, revenue: 0 },
    },
  ]);

  // campaigns saved before v2 get the design's default «سرویس‌های مشمول»
  await Campaigns.updateMany({ services: { $exists: false } }, { $set: { services: [...SCHOOL_CAMPAIGN.services] } });

  // catalog cache: bump the version so nothing stale is served
  await app.get(RedisService).client.incr(REDIS_KEYS.catalogVer);

  log.log(`base data: inserted ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')} (existing documents untouched)`);
  return counts;
}
