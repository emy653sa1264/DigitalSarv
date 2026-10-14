import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TokenVerifier } from '../../common/auth/token-verifier.service.js';
import { defined } from '../../common/utils/defined.js';
import { fa } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { TERMINAL_STATUSES } from '../orders/order-helpers.js';
import { Order } from '../orders/order.schema.js';
import { PriceVersion } from '../price-book/schemas/price-version.schema.js';
import { User } from '../users/user.schema.js';
import { makeReferralCode } from '../users/users.service.js';
import { Zone } from '../zones/zone.schema.js';
import { Center } from './center.schema.js';
import type { ProviderDto } from './dto/provider.dto.js';
import { providerAdminJson, providerSelfJson, type CenterRow, type ProviderAdmin, type ProviderSelf } from './provider-json.js';
import { providerDefaults, providerProblem, type ProviderProfile } from './provider-model.js';

const NOT_FOUND = 'مجری یافت نشد';
const CHANGED = 'وضعیت این حساب تغییر کرده است؛ دوباره تلاش کنید';
const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

@Injectable()
export class ProvidersService {
  constructor(
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Zone.name) private readonly zones: Model<Zone>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    private readonly sessions: TokenVerifier,
  ) {}

  async list(): Promise<ProviderAdmin[]> {
    return this.adminJson((await this.centers.find().sort({ _id: 1 }).lean()) as CenterRow[]);
  }

  async get(id: string): Promise<ProviderAdmin> {
    return (await this.adminJson([await this.find(id)]))[0];
  }

  async self(providerId: string): Promise<ProviderSelf> {
    const doc = await this.find(providerId);
    return providerSelfJson(doc, await this.zoneNames([doc]));
  }

  async create(dto: ProviderDto): Promise<ProviderAdmin> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('نام مجری را وارد کنید');
    const doc = await this.centers.create({ ...providerDefaults(), ...(await this.validated(dto)), name });
    return this.get(String(doc._id));
  }

  async update(id: string, dto: ProviderDto): Promise<ProviderAdmin> {
    assertObjectId(id, 'مجری');
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('نام مجری را وارد کنید');
    const fields = await this.validated(dto);
    const doc = await this.centers.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException(NOT_FOUND);
    return this.get(id);
  }

  /** 409 while open orders reference it or it has price history (deactivate instead); deletes, then unlinks the login. */
  async remove(id: string): Promise<{ ok: true }> {
    const c = await this.find(id);
    const open = await this.orders.countDocuments({ centerId: c._id, status: { $nin: TERMINAL_STATUSES } });
    if (open) throw new ConflictException(`این مجری ${fa(open)} سفارش باز دارد؛ ابتدا سفارش‌ها را به مجری دیگری بدهید`);
    if (await this.versions.exists({ $or: [{ layer: 'provider', providerId: c._id }, { baseProviderId: c._id }] })) {
      throw new ConflictException('این مجری قیمت ثبت‌شده دارد؛ به‌جای حذف آن را غیرفعال کنید');
    }
    await this.centers.deleteOne({ _id: c._id });
    if (c.userId) await this.detach(c.userId, c._id);
    return { ok: true };
  }

  /**
   * Links (or creates) the provider's login. Every write is conditional on what was read (user role/link, centre's
   * previous login) so concurrent links answer 409 instead of overwriting; the previous login is detached last.
   */
  async linkLogin(id: string, rawPhone: string): Promise<ProviderAdmin> {
    const center = await this.find(id);
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('شماره موبایل مجری معتبر نیست');
    const existing = await this.users.findOne({ phone }).lean();
    if (existing?.role === 'admin') throw new ConflictException('این شماره متعلق به مدیر سیستم است');
    if (existing?.role === 'courier') throw new ConflictException('این شماره متعلق به یک پیک است');
    if (existing?.role === 'provider' && existing.providerId && String(existing.providerId) !== id) throw new ConflictException('این شماره به مجری دیگری متصل است');
    const changed = () => new ConflictException(CHANGED);

    let userId: Types.ObjectId;
    let claimed = false; // whether this call changed the user
    if (!existing) {
      try {
        const created = await this.users.create({ phone, name: center.contactName || center.name, role: 'provider', planId: 'bronze', referralCode: makeReferralCode(), providerId: center._id });
        userId = created._id as Types.ObjectId;
      } catch (e) {
        throw isDuplicateKey(e) ? changed() : e;
      }
      claimed = true;
    } else {
      userId = existing._id as Types.ObjectId;
      if (existing.role !== 'provider' || String(existing.providerId) !== id) {
        const updated = await this.users.findOneAndUpdate(
          { _id: userId, role: existing.role, providerId: existing.providerId ?? null },
          { $set: { role: 'provider', providerId: center._id } },
          { returnDocument: 'after' },
        );
        if (!updated) throw changed();
        claimed = true;
      }
    }

    let ok = false;
    try {
      const res = await this.centers.updateOne({ _id: center._id, userId: center.userId ?? { $exists: false } }, { $set: { userId } });
      ok = res.matchedCount > 0;
    } catch (e) {
      if (!isDuplicateKey(e)) {
        if (claimed) await this.detach(userId, center._id);
        throw e;
      }
    }
    if (!ok) {
      if (claimed) await this.detach(userId, center._id);
      throw changed();
    }
    if (claimed) await this.sessions.revokeUser(String(userId));
    if (center.userId && String(center.userId) !== String(userId)) await this.detach(center.userId, center._id);
    return this.get(id);
  }

  async unlinkLogin(id: string): Promise<ProviderAdmin> {
    const c = await this.find(id);
    if (c.userId) {
      await this.centers.updateOne({ _id: c._id, userId: c.userId }, { $unset: { userId: 1 } });
      await this.detach(c.userId, c._id);
    }
    return this.get(id);
  }

  // ------------------------------------------------------------ helpers

  private async find(id: string): Promise<CenterRow> {
    assertObjectId(id, 'مجری');
    const doc = (await this.centers.findById(id).lean()) as CenterRow | null;
    if (!doc) throw new NotFoundException(NOT_FOUND);
    return doc;
  }

  /** The login goes back to a plain customer account; its tokens (role `provider`) stop working. */
  private async detach(userId: Types.ObjectId | string, providerId: Types.ObjectId) {
    await this.users.updateOne({ _id: userId, role: 'provider', providerId }, { $set: { role: 'customer' }, $unset: { providerId: 1 } });
    await this.sessions.revokeUser(String(userId));
  }

  /** DTO → `$set` fields: undefined keys dropped, contact phone normalized, references and cross-field rules checked. */
  private async validated(dto: ProviderDto): Promise<Record<string, unknown>> {
    const fields: Record<string, unknown> = defined({ ...dto });
    if (typeof fields.name === 'string') fields.name = fields.name.trim();
    if (typeof dto.phone === 'string') {
      const raw = dto.phone.trim();
      const phone = raw ? normalizePhone(raw) : '';
      if (phone === null) throw new BadRequestException('شماره تماس معتبر نیست');
      fields.phone = phone;
    }
    const [zones, papers] = await Promise.all([
      dto.serviceZoneIds ? this.zones.find({}, { _id: 1 }).lean() : Promise.resolve([]),
      dto.capabilities ? this.papers.find({}, { key: 1 }).lean() : Promise.resolve([]),
    ]);
    const problem = providerProblem(fields as Partial<ProviderProfile>, {
      zoneIds: new Set(zones.map((z) => String(z._id))),
      paperKeys: new Set((papers as { key: string }[]).map((p) => p.key)),
    });
    if (problem) throw new BadRequestException(problem);
    if (dto.serviceZoneIds) fields.serviceZoneIds = dto.serviceZoneIds.map((z) => new Types.ObjectId(z));
    return fields;
  }

  private async zoneNames(docs: CenterRow[]) {
    const ids = [...new Set(docs.flatMap((d) => (d.serviceZoneIds ?? []).map(String)))];
    const zones = ids.length ? await this.zones.find({ _id: { $in: ids.map((z) => new Types.ObjectId(z)) } }, { name: 1 }).lean() : [];
    return new Map(zones.map((z) => [String(z._id), z.name]));
  }

  private async adminJson(docs: CenterRow[]): Promise<ProviderAdmin[]> {
    const zoneNames = await this.zoneNames(docs);
    const userIds = docs.map((d) => d.userId).filter((u): u is Types.ObjectId => !!u);
    const users = userIds.length ? await this.users.find({ _id: { $in: userIds } }, { phone: 1, name: 1, role: 1, providerId: 1 }).lean() : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return docs.map((d) => {
      const u = d.userId ? byId.get(String(d.userId)) : undefined;
      // a stale link (role changed / moved) is not shown as a login
      const live = u && u.role === 'provider' && String(u.providerId) === String(d._id);
      return providerAdminJson(d, zoneNames, live ? u : null);
    });
  }
}
