import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PLAN_IDS, REDIS_KEYS } from '../../common/constants.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { tehranYmd } from '../../common/utils/dates.js';
import { defined } from '../../common/utils/defined.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { campaignBlock } from '../campaigns/campaign-window.js';
import { Campaign, campaignJson } from '../campaigns/campaign.schema.js';
import {
  DEFAULT_PRICES,
  PRICE_KEYS,
  bindColorCss,
  defaultChecklists,
  defaultCourierPay,
  defaultOps,
  type Checklists,
  type CourierPaySettings,
  type OpsSettings,
  type Prices,
} from './catalog.defaults.js';
import type {
  CreateBindColorDto,
  CreateColorDto,
  CreateExtraDto,
  CreateGradeDto,
  CreatePaperDto,
  UpdateBindColorDto,
  UpdateColorDto,
  UpdateExtraDto,
  UpdateGradeDto,
  UpdatePaperDto,
  UpdatePlanDto,
  UpdatePricesDto,
} from './dto/catalog.dto.js';
import type { UpdateSettingsDto } from './dto/settings.dto.js';
import { BindColor } from './schemas/bind-color.schema.js';
import { Color } from './schemas/color.schema.js';
import { Extra } from './schemas/extra.schema.js';
import { Grade } from './schemas/grade.schema.js';
import { Paper } from './schemas/paper.schema.js';
import { Plan } from './schemas/plan.schema.js';
import { Settings, SETTINGS_ID } from './schemas/settings.schema.js';

const CATALOG_TTL = 3600;

const newKey = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** The settings document merged over every default (documents saved before a key existed read the default). */
export interface ResolvedSettings {
  prices: Prices;
  urgentEnabled: boolean;
  ops: OpsSettings;
  courier: CourierPaySettings;
  checklists: Checklists;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Color.name) private readonly colors: Model<Color>,
    @InjectModel(Extra.name) private readonly extras: Model<Extra>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(BindColor.name) private readonly bindColors: Model<BindColor>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(Settings.name) private readonly settings: Model<Settings>,
    @InjectModel(Campaign.name) private readonly campaigns: Model<Campaign>,
    private readonly redis: RedisService,
  ) {}

  // ------------------------------------------------------------ public catalog

  async getCatalog() {
    return this.withOpenCampaign(await this.buildCatalog());
  }

  /**
   * The campaign window is evaluated on every request (v3.3), never frozen in the cache: outside its
   * Tehran-day window the catalog shows `campaign: null`.
   */
  private withOpenCampaign(catalog: Record<string, unknown>): Record<string, unknown> {
    const campaign = catalog.campaign as { startsAt?: string; endsAt?: string } | null | undefined;
    if (!campaign || !campaignBlock(campaign, tehranYmd())) return catalog;
    return { ...catalog, campaign: null };
  }

  private async buildCatalog(): Promise<Record<string, unknown>> {
    // read the version BEFORE loading from Mongo: if an invalidation lands while we build, our result is
    // written under the old (dead) version key and never served
    const key = REDIS_KEYS.catalog((await this.redis.client.get(REDIS_KEYS.catalogVer)) ?? '0');
    const cached = await this.redis.getJson<Record<string, unknown>>(key);
    if (cached) return cached;
    const [colors, extras, grades, papers, bindColors, plans, settings, campaign] = await Promise.all([
      this.colors.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.extras.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.grades.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.papers.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.bindColors.find({ on: true }).sort({ sort: 1, _id: 1 }),
      this.listPlans(),
      this.getSettings(),
      this.campaigns.findOne({ active: true }),
    ]);
    const catalog = JSON.parse(
      JSON.stringify({
        colors,
        extras,
        grades,
        bindColors,
        papers,
        plans,
        prices: settings.prices,
        urgentEnabled: settings.urgentEnabled,
        ops: settings.ops,
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

  async getSettings(): Promise<ResolvedSettings> {
    const s = await this.settings.findById(SETTINGS_ID);
    const ops = defaultOps();
    const courier = defaultCourierPay();
    const checklists = defaultChecklists();
    return {
      prices: { ...DEFAULT_PRICES, ...s?.prices } as Prices,
      urgentEnabled: s?.urgentEnabled ?? true,
      ops: { ...ops, ...defined(s?.ops ?? {}) } as OpsSettings,
      courier: { ...courier, ...defined(s?.courier ?? {}) } as CourierPaySettings,
      checklists: {
        qc: { ...checklists.qc, ...defined(s?.checklists?.qc ?? {}) } as Checklists['qc'],
        pickup: s?.checklists?.pickup?.length ? s.checklists.pickup : checklists.pickup,
      },
    };
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

  /** «تنظیمات» (v3.3). */
  async getAdminSettings() {
    const { ops, courier, checklists } = await this.getSettings();
    return { ops, courier, checklists };
  }

  /** Partial update: given fields replace the current value; lists are replaced as a whole. */
  async updateSettings(dto: UpdateSettingsDto) {
    const current = await this.getSettings();
    const ops = { ...current.ops, ...defined(dto.ops ?? {}) } as OpsSettings;
    const courier = { ...current.courier, ...defined(dto.courier ?? {}) } as CourierPaySettings;
    const checklists: Checklists = {
      qc: { ...current.checklists.qc, ...defined(dto.checklists?.qc ?? {}) } as Checklists['qc'],
      pickup: dto.checklists?.pickup ?? current.checklists.pickup,
    };
    await this.settings.updateOne(
      { _id: SETTINGS_ID },
      { $set: { ops, courier, checklists }, $setOnInsert: { prices: { ...DEFAULT_PRICES }, urgentEnabled: true } },
      { upsert: true },
    );
    await this.invalidate();
    return { ops, courier, checklists };
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

  // ------------------------------------------------------------ list ordering (v3.3)

  /**
   * Sets `sort` to the 1-based position in `ids`; documents not listed keep their relative order after
   * them. The first `on` item by `sort` is the default (paper / spiral colour / bind colour).
   */
  private async reorder<T>(model: Model<T>, ids: string[]): Promise<void> {
    const existing = await model.find({}, { _id: 1 }).sort({ sort: 1, _id: 1 });
    const known = existing.map((d) => String(d._id));
    const listed = [...new Set(ids)];
    if (listed.some((id) => !known.includes(id))) throw new BadRequestException('برخی شناسه‌های فهرست معتبر نیستند');
    const order = [...listed, ...known.filter((id) => !listed.includes(id))];
    await model.bulkWrite(order.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sort: i + 1 } } } })) as never);
    await this.invalidate();
  }

  async reorderColors(ids: string[]) { await this.reorder(this.colors, ids); return this.listColors(); }
  async reorderExtras(ids: string[]) { await this.reorder(this.extras, ids); return this.listExtras(); }
  async reorderGrades(ids: string[]) { await this.reorder(this.grades, ids); return this.listGrades(); }
  async reorderPapers(ids: string[]) { await this.reorder(this.papers, ids); return this.listPapers(); }
  async reorderBindColors(ids: string[]) { await this.reorder(this.bindColors, ids); return this.listBindColors(); }

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

  // ------------------------------------------------------------ bind colours (v3.3 «رنگ جلد»)

  listBindColors() {
    return this.bindColors.find().sort({ sort: 1, _id: 1 });
  }

  async createBindColor(dto: CreateBindColorDto) {
    const sort = (await this.bindColors.countDocuments()) + 1;
    const doc = await this.bindColors.create({ ...defined(dto), key: newKey('b'), css: bindColorCss(dto.hex), on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  /** A new `hex` re-derives `css` (the seeded «ابر و باد» keeps its pattern until its hex is edited). */
  async updateBindColor(id: string, dto: UpdateBindColorDto) {
    assertObjectId(id, 'رنگ جلد');
    const $set = { ...defined(dto), ...(dto.hex ? { css: bindColorCss(dto.hex) } : {}) };
    const doc = await this.bindColors.findByIdAndUpdate(id, { $set }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('رنگ جلد یافت نشد');
    await this.invalidate();
    return doc;
  }

  async deleteBindColor(id: string) {
    assertObjectId(id, 'رنگ جلد');
    const doc = await this.bindColors.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('رنگ جلد یافت نشد');
    await this.invalidate();
    return { ok: true };
  }

  async toggleAllBindColors(on: boolean) {
    await this.bindColors.updateMany({}, { $set: { on } });
    await this.invalidate();
    return this.listBindColors();
  }

  // ------------------------------------------------------------ extras

  listExtras() {
    return this.extras.find().sort({ sort: 1, _id: 1 });
  }

  async createExtra(dto: CreateExtraDto) {
    const sort = (await this.extras.countDocuments()) + 1;
    const doc = await this.extras.create({ ...defined(dto), key: newKey('x'), on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  async updateExtra(id: string, dto: UpdateExtraDto) {
    assertObjectId(id, 'خدمت');
    const doc = await this.extras.findByIdAndUpdate(id, { $set: defined(dto) }, { returnDocument: 'after' });
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

  // ------------------------------------------------------------ papers (v3 «نوع کاغذ»)

  listPapers() {
    return this.papers.find().sort({ sort: 1, _id: 1 });
  }

  async createPaper(dto: CreatePaperDto) {
    const sort = (await this.papers.countDocuments()) + 1;
    const doc = await this.papers.create({ ...dto, key: newKey('p'), on: dto.on ?? true, sort });
    await this.invalidate();
    return doc;
  }

  /** Renaming or repricing a paper does not rewrite historical orders. */
  async updatePaper(id: string, dto: UpdatePaperDto) {
    assertObjectId(id, 'کاغذ');
    const doc = await this.papers.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('نوع کاغذ یافت نشد');
    await this.invalidate();
    return doc;
  }

  async deletePaper(id: string) {
    assertObjectId(id, 'کاغذ');
    const doc = await this.papers.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('نوع کاغذ یافت نشد');
    await this.invalidate();
    return { ok: true };
  }

  async toggleAllPapers(on: boolean) {
    await this.papers.updateMany({}, { $set: { on } });
    await this.invalidate();
    return this.listPapers();
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
