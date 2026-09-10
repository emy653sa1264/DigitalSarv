import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_CAMPAIGN_SERVICES, type PlanId } from '../../common/constants.js';
import { tehranDayStart, tehranYmd } from '../../common/utils/dates.js';
import { campaignBlock } from '../campaigns/campaign-window.js';
import { Campaign } from '../campaigns/campaign.schema.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { BindColor } from '../catalog/schemas/bind-color.schema.js';
import { Color } from '../catalog/schemas/color.schema.js';
import { Extra } from '../catalog/schemas/extra.schema.js';
import { Grade } from '../catalog/schemas/grade.schema.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { Plan } from '../catalog/schemas/plan.schema.js';
import { Order } from '../orders/order.schema.js';
import { PricingRule } from '../rules/rule.schema.js';
import { pricedServices, quoteDraft } from './pricing.js';
import type { CampaignBlock, OrderDraft, PricingContext, QuoteResult } from './pricing.types.js';

/** Loads the pricing context from MongoDB and delegates the maths to the pure functions in `pricing.ts`. */
@Injectable()
export class PricingService {
  constructor(
    private readonly catalog: CatalogService,
    @InjectModel(Color.name) private readonly colors: Model<Color>,
    @InjectModel(Extra.name) private readonly extras: Model<Extra>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(BindColor.name) private readonly bindColors: Model<BindColor>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(PricingRule.name) private readonly rules: Model<PricingRule>,
    @InjectModel(Campaign.name) private readonly campaigns: Model<Campaign>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  async context(): Promise<PricingContext> {
    const [settings, colors, extras, grades, papers, bindColors, plans, rules, campaign] = await Promise.all([
      this.catalog.getSettings(),
      // sorted like the catalog: print's spiral colour falls back to the first `on` one by sort, _id
      this.colors.find().sort({ sort: 1, _id: 1 }).lean(),
      this.extras.find().lean(),
      this.grades.find().lean(),
      // all papers (switched-off keys resolve to the first `on` one); same order as the catalog
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.bindColors.find().sort({ sort: 1, _id: 1 }).lean(),
      this.plans.find().lean(),
      this.rules.find({ on: true }).sort({ order: 1 }).lean(),
      this.campaigns.findOne({ active: true }).lean(),
    ]);
    const blocked = campaign ? await this.campaignBlocked(campaign) : undefined;
    return {
      prices: settings.prices,
      urgentEnabled: settings.urgentEnabled,
      colors: colors.map((c) => ({ key: c.key, name: c.name, extra: c.extra, on: c.on, sort: c.sort })),
      // lean() skips schema defaults: an extra saved before v3.3 has no `services` (= both)
      extras: extras.map((e) => ({ key: e.key, label: e.label, price: e.price, on: e.on, ...(e.services ? { services: e.services } : {}) })),
      grades: grades.map((g) => ({ name: g.name, books: g.books })),
      papers: papers.map((x) => ({ key: x.key, name: x.name, price: x.price, on: x.on, sort: x.sort })),
      bindColors: bindColors.map((b) => ({ key: b.key, name: b.name, extra: b.extra ?? 0, on: b.on, sort: b.sort })),
      plans: plans.map((p) => ({
        id: p._id,
        name: p.name,
        title: p.title,
        cap: p.cap,
        disc: p.disc,
        freeDelivery: p.freeDelivery,
        freePickup: p.freePickup,
      })),
      rules: rules.map((r) => ({
        id: String(r._id),
        order: r.order,
        on: r.on,
        condition: r.condition,
        effect: r.effect,
        effectLabel: r.effectLabel,
      })),
      campaign: campaign
        ? {
            title: campaign.title,
            code: campaign.code,
            couponPct: campaign.couponPct,
            couponCap: campaign.couponCap,
            // lean() skips schema defaults: a document saved before `services` existed gets the default
            services: campaign.services?.length ? campaign.services : [...DEFAULT_CAMPAIGN_SERVICES],
            ...(blocked ? { blocked } : {}),
          }
        : null,
      ops: settings.ops,
      checklists: settings.checklists,
    };
  }

  /**
   * v3.3 campaign enforcement, evaluated per request: outside `startsAt..endsAt` (Tehran days, inclusive)
   * or, with `dailyCapacity` > 0, once today's placed orders (not cancelled / not awaiting payment) that
   * used the coupon reach it.
   */
  private async campaignBlocked(c: { code: string; startsAt: Date; endsAt: Date; dailyCapacity?: number }): Promise<CampaignBlock | undefined> {
    const today = tehranYmd();
    const window = campaignBlock({ startsAt: c.startsAt, endsAt: c.endsAt }, today);
    if (window || !((c.dailyCapacity ?? 0) > 0)) return window;
    const usedToday = await this.orders.countDocuments({
      coupon: c.code.trim().toUpperCase(),
      'quote.couponValid': true,
      status: { $nin: ['cancelled', 'pending_payment'] },
      createdAt: { $gte: tehranDayStart(today) },
    });
    return campaignBlock(c, today, usedToday);
  }

  async quote(draft: OrderDraft, planId?: PlanId, ctx?: PricingContext): Promise<QuoteResult> {
    return quoteDraft(draft, ctx ?? (await this.context()), planId);
  }

  pricedServices(draft: OrderDraft, ctx: PricingContext) {
    return pricedServices(draft, ctx);
  }
}
