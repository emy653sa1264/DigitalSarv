import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_CAMPAIGN_SERVICES, type PlanId } from '../../common/constants.js';
import { Campaign } from '../campaigns/campaign.schema.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Color } from '../catalog/schemas/color.schema.js';
import { Extra } from '../catalog/schemas/extra.schema.js';
import { Grade } from '../catalog/schemas/grade.schema.js';
import { Plan } from '../catalog/schemas/plan.schema.js';
import { PricingRule } from '../rules/rule.schema.js';
import { pricedServices, quoteDraft } from './pricing.js';
import type { OrderDraft, PricingContext, QuoteResult } from './pricing.types.js';

/** Loads the pricing context from MongoDB and delegates the maths to the pure functions in `pricing.ts`. */
@Injectable()
export class PricingService {
  constructor(
    private readonly catalog: CatalogService,
    @InjectModel(Color.name) private readonly colors: Model<Color>,
    @InjectModel(Extra.name) private readonly extras: Model<Extra>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
    @InjectModel(PricingRule.name) private readonly rules: Model<PricingRule>,
    @InjectModel(Campaign.name) private readonly campaigns: Model<Campaign>,
  ) {}

  async context(): Promise<PricingContext> {
    const [settings, colors, extras, grades, plans, rules, campaign] = await Promise.all([
      this.catalog.getSettings(),
      this.colors.find().lean(),
      this.extras.find().lean(),
      this.grades.find().lean(),
      this.plans.find().lean(),
      this.rules.find({ on: true }).sort({ order: 1 }).lean(),
      this.campaigns.findOne({ active: true }).lean(),
    ]);
    return {
      prices: settings.prices,
      urgentEnabled: settings.urgentEnabled,
      colors: colors.map((c) => ({ key: c.key, extra: c.extra })),
      extras: extras.map((e) => ({ key: e.key, price: e.price, on: e.on })),
      grades: grades.map((g) => ({ name: g.name, books: g.books })),
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
          }
        : null,
    };
  }

  async quote(draft: OrderDraft, planId?: PlanId, ctx?: PricingContext): Promise<QuoteResult> {
    return quoteDraft(draft, ctx ?? (await this.context()), planId);
  }

  pricedServices(draft: OrderDraft, ctx: PricingContext) {
    return pricedServices(draft, ctx);
  }
}
