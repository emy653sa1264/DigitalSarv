import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { infraImports } from '../app.module.js';
import { EXTRA_SERVICES, REDIS_KEYS } from '../common/constants.js';
import { RedisService } from '../common/redis/redis.service.js';
import { addDays, tehranDayStart } from '../common/utils/dates.js';
import { Campaign } from '../modules/campaigns/campaign.schema.js';
import { BIND_COLORS, DEFAULT_PRICES } from '../modules/catalog/catalog.defaults.js';
import { BindColor } from '../modules/catalog/schemas/bind-color.schema.js';
import { Color } from '../modules/catalog/schemas/color.schema.js';
import { Extra } from '../modules/catalog/schemas/extra.schema.js';
import { Grade } from '../modules/catalog/schemas/grade.schema.js';
import { Paper } from '../modules/catalog/schemas/paper.schema.js';
import { Plan } from '../modules/catalog/schemas/plan.schema.js';
import { Settings, SETTINGS_ID } from '../modules/catalog/schemas/settings.schema.js';
import { Center } from '../modules/centers/center.schema.js';
import { CmsSection } from '../modules/cms/cms-section.schema.js';
import { NotificationTemplate } from '../modules/notifications/notification-template.schema.js';
import { PricingRule } from '../modules/rules/rule.schema.js';
import { Zone } from '../modules/zones/zone.schema.js';
import {
  CENTERS,
  CMS,
  CMS_DOCS_OLD_LABEL,
  COLORS,
  EXTRAS,
  GRADES,
  NOTIFICATIONS,
  OBSOLETE_CMS_KEYS,
  PAPERS,
  PLANS,
  RULES,
  SCHOOL_CAMPAIGN,
  SCHOOL_ONLY_EXTRAS,
  TEXT_EXTRAS,
  ZONES,
} from './base-data.js';

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
  const Cms = model<CmsSection>(CmsSection.name);
  const hadPrintSection = !!(await Cms.exists({ key: 'print' }));

  // v3.3: order notifications are `push` (in-app + web push); SMS is only for the login OTP. An `sms`
  // template becomes the event's `push` template (keeping the admin's wording), or is dropped when the
  // event already has one — before the missing `push` templates are inserted below
  const Templates = model<NotificationTemplate>(NotificationTemplate.name);
  let notificationsConverted = 0;
  let notificationsDropped = 0;
  for (const t of await Templates.find({ channel: 'sms' })) {
    if (await Templates.exists({ event: t.event, channel: 'push' })) {
      notificationsDropped += (await Templates.deleteOne({ _id: t._id })).deletedCount;
    } else {
      notificationsConverted += (await Templates.updateOne({ _id: t._id, channel: 'sms' }, { $set: { channel: 'push' } })).modifiedCount;
    }
  }

  const counts: Record<string, number> = {
    plans: await insertMissing<Plan>(Plan.name, ['_id'], PLANS.map((p) => ({ ...p, grad: [...p.grad] }))),
    colors: await insertMissing<Color>(Color.name, ['key'], COLORS),
    extras: await insertMissing<Extra>(Extra.name, ['key'], EXTRAS),
    grades: await insertMissing<Grade>(Grade.name, ['name'], GRADES),
    papers: await insertMissing<Paper>(Paper.name, ['key'], PAPERS),
    bindColors: await insertMissing<BindColor>(BindColor.name, ['key'], BIND_COLORS.map((b) => ({ ...b }))),
    settings: await insertMissing<Settings>(Settings.name, ['_id'], [{ _id: SETTINGS_ID, prices: { ...DEFAULT_PRICES }, urgentEnabled: true }]),
    cms: await insertMissing<CmsSection>(CmsSection.name, ['key'], CMS.map(([key, label, on], i) => ({ key, label, on, order: i + 1 }))),
    notifications: await insertMissing<NotificationTemplate>(NotificationTemplate.name, ['event', 'channel'], NOTIFICATIONS.map((n) => ({ ...n }))),
    notificationsConverted,
    notificationsDropped,
    zones: await insertMissing<Zone>(Zone.name, ['name'], ZONES),
    centers: await insertMissing<Center>(Center.name, ['name'], CENTERS),
  };

  // v3.3 extras scope: documents saved before `services` / `needsText` existed get the seeded values once
  // (only while the field is missing — admin edits win)
  const Extras = model<Extra>(Extra.name);
  counts.extrasScoped =
    (await Extras.updateMany({ key: { $in: SCHOOL_ONLY_EXTRAS }, services: { $exists: false } }, { $set: { services: ['school'] } })).modifiedCount +
    (await Extras.updateMany({ services: { $exists: false } }, { $set: { services: [...EXTRA_SERVICES] } })).modifiedCount;
  await Extras.updateMany({ key: { $in: TEXT_EXTRAS }, needsText: { $exists: false } }, { $set: { needsText: true } });
  await Extras.updateMany({ needsText: { $exists: false } }, { $set: { needsText: false } });

  // the exceptions to "never touch existing documents" — landing sections:
  // 1) sections the landing does not render are removed
  counts.cmsRemoved = (await Cms.deleteMany({ key: { $in: OBSOLETE_CMS_KEYS } })).deletedCount;
  // 2) v3.2: `docs` becomes «پایان‌نامه و صحافی», only while it still has the old default label (an admin rename wins)
  counts.cmsRelabelled = (
    await Cms.updateOne({ key: 'docs', label: CMS_DOCS_OLD_LABEL }, { $set: { label: 'پایان‌نامه و صحافی' } })
  ).modifiedCount;
  // 3) in the run that inserts `print`, place it right before `docs`: on an existing database its seeded
  //    position collides with `docs`, so `docs` and every section after it move down one place
  counts.cmsReordered = 0;
  if (!hadPrintSection) {
    const [print, docs] = await Promise.all([Cms.findOne({ key: 'print' }), Cms.findOne({ key: 'docs' })]);
    if (print && docs && print.order >= docs.order) {
      await Cms.updateMany({ key: { $ne: 'print' }, order: { $gte: docs.order } }, { $inc: { order: 1 } });
      await Cms.updateOne({ _id: print._id }, { $set: { order: docs.order } });
      counts.cmsReordered = 1;
    }
  }

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
