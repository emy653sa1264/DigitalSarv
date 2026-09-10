import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import type { PlanId } from '../../common/constants.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Plan } from '../catalog/schemas/plan.schema.js';
import { User, UserDocument } from './user.schema.js';

export function makeReferralCode(): string {
  return 'SARV-' + randomBytes(3).toString('hex').toUpperCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
  ) {}

  findByPhone(phone: string) {
    return this.users.findOne({ phone });
  }

  async findOrCreateByPhone(phone: string): Promise<UserDocument> {
    const existing = await this.users.findOne({ phone });
    if (existing) return existing;
    return this.users.create({ phone, name: '', role: 'customer', planId: 'bronze', referralCode: makeReferralCode() });
  }

  async get(id: string): Promise<UserDocument> {
    assertObjectId(id, 'کاربر');
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return user;
  }

  async updateName(id: string, name?: string): Promise<UserDocument> {
    const user = await this.get(id);
    if (typeof name === 'string') user.name = name.trim();
    return user.save();
  }

  async setPlan(id: string, planId: PlanId): Promise<UserDocument> {
    if (!(await this.plans.exists({ _id: planId }))) throw new NotFoundException('پلن عضویت یافت نشد');
    const user = await this.get(id);
    user.planId = planId; // payment gateway is stubbed — membership is activated immediately
    return user.save();
  }
}
