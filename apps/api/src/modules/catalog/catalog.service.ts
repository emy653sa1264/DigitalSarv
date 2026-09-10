import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PLAN_IDS, REDIS_KEYS } from '../../common/constants.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Campaign, campaignJson } from '../campaigns/campaign.schema.js';
import { BIND_COLORS, DEFAULT_PRICES, PRICE_KEYS, type Prices } from './catalog.defaults.js';
import type {
  CreateColorDto,
  CreateExtraDto,
  CreateGradeDto,
  UpdateColorDto,
  UpdateExtraDto,
  UpdateGradeDto,
  UpdatePlanDto,
  UpdatePricesDto,
} from './dto/catalog.dto.js';
import { Color } from './schemas/color.schema.js';
import { Extra } from './schemas/extra.schema.js';
import { Grade } from './schemas/grade.schema.js';
import { Plan } from './schemas/plan.schema.js';
import { Settings, SETTINGS_ID } from './schemas/settings.schema.js';

const CATALOG_TTL = 3600;

const newKey = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Color.name) private readonly colors: Model<Color>,
    @InjectModel(Extra.name) private readonly extras: Model<Extra>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(Settings.name) private readonly settings: Model<Settings>,
    @InjectModel(Campaign.name) private readonly campaigns: Model<Campaign>,
    private readonly redis: RedisService,
  ) {}

  // ------------------------------------------------------------ public catalog

  async getCatalog() {
    // read the version BEFORE loading from Mongo: if an invalidation lands while we build, our result is
    // written under the old (dead) version key and never served
    const key = REDIS_KEYS.catalog((await this.redis.client.get(REDIS_KEYS.catalogVer)) ?? '0');
    const cached = await this.redis.getJson<Record<string, unknown>>(key);
    if (cached) return cached;
    const [colors, extras, grades, plans, settings, campaign] = await Promise.all([
      this.colors.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.extras.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.grades.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.listPlans(),
      this.getSettings(),
      this.campaigns.findOne({ active: true }),
    ]);
    const catalog = JSON.parse(
      JSON.stringify({
        colors,
        extras,
        grades,
        bindColors: BIND_COLORS,
        plans,
        prices: settings.prices,
        urgentEnabled: settings.urgentEnabled,
        campaign: campaign ? campaignJson(campaign) : null,
      }),
    ) as Record<string, unknown>;
    await this.redis.setJson(key, catalog, CATALOG_TTL);
    return catalog;
  }

  /** Bumps the catalog version; entries of older versions are never read again and expire by TTL. */
  async invalidate(): Promise<void> {
    await this.redis.client.incr(REDIS_KEYS.catalogVer);
  }

  // ------------------------------------------------------------ settings / prices

  async getSettings() {
    const s = await this.settings.findById(SETTINGS_ID);
    if (s) return { prices: { ...DEFAULT_PRICES, ...s.prices } as Prices, urgentEnabled: s.urgentEnabled };
    return { prices: { ...DEFAULT_PRICES }, urgentEnabled: true };
  }

  async getPrices() {
    const s = await this.getSettings();
    return { ...s.prices, urgentEnabled: s.urgentEnabled };
  }

  async updatePrices(dto: UpdatePricesDto) {
    const current = await this.getSettings();
    const prices = { ...current.prices };
    for (const k of PRICE_KEYS) {
      const v = dto[k];
      if (typeof v === 'number') prices[k] = v;
    }
    const urgentEnabled = typeof dto.urgentEnabled === 'boolean' ? dto.urgentEnabled : current.urgentEnabled;
    await this.settings.updateOne({ _id: SETTINGS_ID }, { $set: { prices, urgentEnabled } }, { upsert: true });
    await this.invalidate();
    return { ...prices, urgentEnabled };
  }

  async resetPrices() {
    const s = await this.getSettings();
    await this.settings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { prices: { ...DEFAULT_PRICES } } },
      { upsert: true },
    );
    await this.invalidate();
    return { ...DEFAULT_PRICES, urgentEnabled: s.urgentEnabled };
  }

  // ------------------------------------------------------------ plans

  async listPlans() {
    const plans = await this.plans.find();
    return plans.sort((a, b) => PLAN_IDS.indexOf(a._id) - PLAN_IDS.indexOf(b._id));
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.plans.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!plan) throw new NotFoundException('پلن عضویت یافت نشد');
    await this.invalidate();
    return plan;
  }

  // ------------------------------------------------------------ colors

  listColors() {
    return this.colors.find().sort({ sort: 1, _id: 1 });
  }

  async createColor(dto: CreateColorDto) {
    const sort = (await this.colors.countDocuments()) + 1;
    const doc = await this.colors.create({ ...dto, key: newKey('c'), on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  async updateColor(id: string, dto: UpdateColorDto) {
    assertObjectId(id, 'رنگ');
    const doc = await this.colors.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('رنگ یافت نشد');
    await this.invalidate();
    return doc;
  }

  async deleteColor(id: string) {
    assertObjectId(id, 'رنگ');
    const doc = await this.colors.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('رنگ یافت نشد');
    await this.invalidate();
    return { ok: true };
  }

  async toggleAllColors(on: boolean) {
    await this.colors.updateMany({}, { $set: { on } });
    await this.invalidate();
    return this.listColors();
  }

  // ------------------------------------------------------------ extras

  listExtras() {
    return this.extras.find().sort({ sort: 1, _id: 1 });
  }

  async createExtra(dto: CreateExtraDto) {
    const sort = (await this.extras.countDocuments()) + 1;
    const doc = await this.extras.create({ ...dto, key: newKey('x'), on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  async updateExtra(id: string, dto: UpdateExtraDto) {
    assertObjectId(id, 'خدمت');
    const doc = await this.extras.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('خدمت اضافی یافت نشد');
    await this.invalidate();
    return doc;
  }

  async deleteExtra(id: string) {
    assertObjectId(id, 'خدمت');
    const doc = await this.extras.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('خدمت اضافی یافت نشد');
    await this.invalidate();
    return { ok: true };
  }

  async toggleAllExtras(on: boolean) {
    await this.extras.updateMany({}, { $set: { on } });
    await this.invalidate();
    return this.listExtras();
  }

  // ------------------------------------------------------------ grades

  listGrades() {
    return this.grades.find().sort({ sort: 1, _id: 1 });
  }

  async createGrade(dto: CreateGradeDto) {
    const sort = (await this.grades.countDocuments()) + 1;
    const doc = await this.grades.create({ ...dto, on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  /** Renaming a grade does not rewrite historical orders (they keep the name they were placed with). */
  async updateGrade(id: string, dto: UpdateGradeDto) {
    assertObjectId(id, 'پایه');
    const doc = await this.grades.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('پایه تحصیلی یافت نشد');
    await this.invalidate();
    return doc;
  }

  async deleteGrade(id: string) {
    assertObjectId(id, 'پایه');
    const doc = await this.grades.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('پایه تحصیلی یافت نشد');
    await this.invalidate();
    return { ok: true };
  }

  async toggleAllGrades(on: boolean) {
    await this.grades.updateMany({}, { $set: { on } });
    await this.invalidate();
    return this.listGrades();
  }
}
