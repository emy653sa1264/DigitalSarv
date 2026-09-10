import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { assertObjectId } from '../../common/utils/object-id.js';
import type { CreateRuleDto, UpdateRuleDto } from './dto/rules.dto.js';
import { conditionLabel, effectLabel } from './rule-labels.js';
import { PricingRule } from './rule.schema.js';

@Injectable()
export class RulesService {
  constructor(@InjectModel(PricingRule.name) private readonly rules: Model<PricingRule>) {}

  list() {
    return this.rules.find().sort({ order: 1 });
  }

  async create(dto: CreateRuleDto) {
    const last = await this.rules.findOne().sort({ order: -1 });
    return this.rules.create({
      condition: { ...dto.condition },
      effect: { ...dto.effect },
      condLabel: dto.condLabel?.trim() || conditionLabel(dto.condition),
      effectLabel: dto.effectLabel?.trim() || effectLabel(dto.effect),
      on: dto.on ?? true,
      order: (last?.order ?? 0) + 1,
      usedCount: 0,
    });
  }

  async update(id: string, dto: UpdateRuleDto) {
    assertObjectId(id, 'قانون');
    const rule = await this.rules.findById(id);
    if (!rule) throw new NotFoundException('قانون قیمت یافت نشد');
    if (dto.condition) {
      rule.condition = { ...dto.condition };
      if (dto.condLabel === undefined) rule.condLabel = conditionLabel(dto.condition);
    }
    if (dto.effect) {
      rule.effect = { ...dto.effect };
      if (dto.effectLabel === undefined) rule.effectLabel = effectLabel(dto.effect);
    }
    if (dto.condLabel !== undefined) rule.condLabel = dto.condLabel;
    if (dto.effectLabel !== undefined) rule.effectLabel = dto.effectLabel;
    if (dto.on !== undefined) rule.on = dto.on;
    rule.markModified('condition');
    rule.markModified('effect');
    return rule.save();
  }

  async remove(id: string) {
    assertObjectId(id, 'قانون');
    const rule = await this.rules.findByIdAndDelete(id);
    if (!rule) throw new NotFoundException('قانون قیمت یافت نشد');
    return { ok: true };
  }

  async reorder(ids: string[]) {
    const existing = await this.rules.find({}, { _id: 1 });
    const known = new Set(existing.map((r) => String(r._id)));
    if (ids.some((id) => !known.has(id))) throw new BadRequestException('برخی شناسه‌های قانون معتبر نیستند');
    await this.rules.bulkWrite(
      ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i + 1 } } } })),
    );
    // rules not mentioned keep their relative order after the listed ones
    const rest = existing.map((r) => String(r._id)).filter((id) => !ids.includes(id));
    if (rest.length) {
      await this.rules.bulkWrite(
        rest.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: ids.length + i + 1 } } } })),
      );
    }
    return this.list();
  }

  async recordUsage(ids: string[]) {
    if (ids.length) await this.rules.updateMany({ _id: { $in: ids } }, { $inc: { usedCount: 1 } });
  }
}
