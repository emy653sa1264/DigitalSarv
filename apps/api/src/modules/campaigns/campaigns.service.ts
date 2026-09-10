import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { defined } from '../../common/utils/defined.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Campaign, campaignJson } from './campaign.schema.js';
import type { CreateCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto.js';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaigns: Model<Campaign>,
    private readonly catalog: CatalogService,
  ) {}

  async list() {
    return (await this.campaigns.find().sort({ active: -1, startsAt: -1 })).map(campaignJson);
  }

  active() {
    return this.campaigns.findOne({ active: true });
  }

  private checkDates(startsAt?: Date, endsAt?: Date) {
    if (startsAt && endsAt && endsAt < startsAt) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
  }

  async create(dto: CreateCampaignDto) {
    this.checkDates(dto.startsAt, dto.endsAt);
    const doc = await this.campaigns.create({ ...defined(dto), code: dto.code.toUpperCase(), active: dto.active ?? false });
    if (doc.active) await this.campaigns.updateMany({ _id: { $ne: doc._id } }, { $set: { active: false } });
    await this.catalog.invalidate();
    return campaignJson(doc);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    assertObjectId(id, 'کمپین');
    const doc = await this.campaigns.findById(id);
    if (!doc) throw new NotFoundException('کمپین یافت نشد');
    this.checkDates(dto.startsAt ?? doc.startsAt, dto.endsAt ?? doc.endsAt);
    Object.assign(doc, { ...defined(dto), ...(dto.code ? { code: dto.code.toUpperCase() } : {}) });
    await doc.save();
    // single-active invariant: activating one campaign deactivates the rest
    if (dto.active === true) await this.campaigns.updateMany({ _id: { $ne: doc._id } }, { $set: { active: false } });
    await this.catalog.invalidate();
    return campaignJson(doc);
  }

  async remove(id: string) {
    assertObjectId(id, 'کمپین');
    const doc = await this.campaigns.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('کمپین یافت نشد');
    await this.catalog.invalidate();
    return { ok: true };
  }

  /**
   * Called when an order with this campaign's coupon is placed. One atomic `$inc` (no lost updates);
   * avgOrder is derived on read. The catalog cache is deliberately not invalidated for stats alone.
   */
  async recordUsage(code: string, books: number, total: number) {
    await this.campaigns.updateOne(
      { code: code.trim().toUpperCase() },
      { $inc: { 'stats.orders': 1, 'stats.books': books, 'stats.revenue': total } },
    );
  }
}
