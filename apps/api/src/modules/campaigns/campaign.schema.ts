import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { CAMPAIGN_SERVICES, DEFAULT_CAMPAIGN_SERVICES, type CampaignService } from '../../common/constants.js';

/** Public shape (docs/api-contract.md). */
export interface CampaignStats { orders: number; books: number; avgOrder: number }
/** Stored shape: running totals bumped with one `$inc` per order; `avgOrder` is derived on read. */
export interface StoredCampaignStats { orders?: number; books?: number; revenue?: number; avgOrder?: number }

export function campaignStats(s: StoredCampaignStats | undefined): CampaignStats {
  const orders = s?.orders ?? 0;
  // documents written before `revenue` existed only carried avgOrder
  const revenue = s?.revenue ?? (s?.avgOrder ?? 0) * orders;
  return { orders, books: s?.books ?? 0, avgOrder: orders ? Math.round(revenue / orders) : 0 };
}

@Schema({ collection: 'campaigns', timestamps: true })
export class Campaign {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: Date, required: true })
  startsAt: Date;

  @Prop({ type: Date, required: true })
  endsAt: Date;

  @Prop({ type: Number, default: 0 })
  couponPct: number;

  @Prop({ type: Number, default: 0 })
  couponCap: number;

  @Prop({ type: Number, default: 0 })
  dailyCapacity: number;

  @Prop({ type: Boolean, default: false, index: true })
  active: boolean;

  @Prop({ type: String, default: '' })
  bannerNote: string;

  @Prop({ type: String, default: '' })
  pickupHours: string;

  /** «سرویس‌های مشمول» — the coupon discounts only these (`school` = book binding). */
  @Prop({ type: [String], enum: CAMPAIGN_SERVICES, default: () => [...DEFAULT_CAMPAIGN_SERVICES] })
  services: CampaignService[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({ orders: 0, books: 0, revenue: 0 }) })
  stats: StoredCampaignStats;
}

export type CampaignDocument = HydratedDocument<Campaign>;

/** JSON for the API: stored totals replaced by the public `{ orders, books, avgOrder }`. */
export function campaignJson(doc: CampaignDocument) {
  return { ...(doc.toJSON() as unknown as Record<string, unknown>), stats: campaignStats(doc.stats) };
}
export const CampaignSchema = SchemaFactory.createForClass(Campaign);
