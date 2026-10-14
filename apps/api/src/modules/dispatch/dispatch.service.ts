import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import type { DeliveryMethod, JobStatus, PickupAt } from '../../common/constants.js';
import { addDays, tehranDayStart, tehranYmd } from '../../common/utils/dates.js';
import { escapeRegex, pageParams } from '../../common/utils/pagination.js';
import { normalizePhone, toAsciiDigits } from '../../common/utils/phone.js';
import { canViewProviderPrices, type Permission } from '../../common/permissions.js';
import { faDigits } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { deliveryOf } from '../orders/delivery-rules.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { Center } from '../centers/center.schema.js';
import type { ProviderService, ProviderStatus } from '../centers/provider-model.js';
import { orderSummary } from '../orders/order-helpers.js';
import { Order, type OrderDelivery } from '../orders/order.schema.js';
import { BindingRange } from '../price-book/schemas/binding-range.schema.js';
import { PriceVersion } from '../price-book/schemas/price-version.schema.js';
import { effectiveProviderEntries, type ProviderEntry, type SnapshotRow } from '../price-book/snapshot.js';
import { User } from '../users/user.schema.js';
import { Zone } from '../zones/zone.schema.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import type { AdminJobStatusDto, AssignJobDto, DeliveryChangeDto, DispatchQueryDto, RespondDto, UpdateJobDto } from './dto/dispatch.dto.js';
import { checkProvider, jobRequirements, type CheckResult, type ProviderCheck, type ProviderFacts, type Usage } from './eligibility.js';
import { dispatchDetail, dispatchRow, type DispatchJobDetail, type DispatchJobRow, type JobRow, type Names } from './job-json.js';
import { DISPATCH_TABS, HELD, LIVE, cancelStage, deliveryStatusFilter, dispatchTabFilter, type DispatchTab, type ProviderQuote } from './job-model.js';
import { Job, type JobDocument } from './job.schema.js';
import { JobsService, raced } from './jobs.service.js';
import { pricingSnapshot, providerLineLabel, providerQuote } from './provider-pricing.js';

export interface EligibilityRow {
  providerId: string; name: string; businessName: string; status: ProviderStatus; current: boolean;
  eligible: boolean; assignable: boolean; checks: ProviderCheck[];
  /** null without provider_price_view (Q18); `priced` and `priceMissing` stay visible. */
  priced: boolean; priceMissing: string[];
  price: { subtotal: number | null; missing: string[]; lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[] } | null;
  capacityLeft: CheckResult['capacityLeft']; hourlySheets?: number; openNow: boolean | null; activeJobs: number; hasLogin: boolean;
  canDeliver: boolean; deliveryFee: number | null; allowCustomerPickup: boolean;
}
export interface Eligibility {
  jobId: string; requirements: string[]; eligible: EligibilityRow[]; others: EligibilityRow[];
  deliveryProviders: { id: string; name: string; deliveryFee: number | null; zoneOk: boolean; status: ProviderStatus; reason?: string }[];
}
export type CenterRow = Center & { _id: Types.ObjectId };
type OrderRow = Order & { _id: Types.ObjectId };
interface ResolvedJobDelivery { method: DeliveryMethod; deliveryProviderId?: Types.ObjectId; pickupAt?: PickupAt; fee: number; orderDelivery: OrderDelivery }
const NOT_CHANGEABLE = 'این سفارش در وضعیتی نیست که بتوان مجری آن را تغییر داد';

const EMPTY_USAGE: Usage = { sheets: 0, jobs: 0, units: {} };
const ACTIVE: JobStatus[] = [...HELD, 'ready', 'ready_for_pickup', 'out_for_delivery'];

/** Provider facts with the v4.1 defaults (centres saved before v4.1 lack them). */
export function factsOf(p: CenterRow): ProviderFacts {
  return {
    id: String(p._id), status: p.status ?? 'active', availableForOrders: p.availableForOrders ?? true, workingHours: p.workingHours ?? [],
    serviceZoneIds: (p.serviceZoneIds ?? []).map(String), capacity: p.capacity ?? { perService: [] }, capacityPerDay: p.capacityPerDay ?? 0,
    capabilities: p.capabilities ?? [], canDeliver: !!p.canDeliver,
  };
}

/** «مرکز تخصیص سفارش» (§55): the admin's view of every job, eligibility (§51–54) and — Task 10 — assignment. */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger('Dispatch');

  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Zone.name) private readonly zones: Model<Zone>,
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    @InjectModel(BindingRange.name) private readonly ranges: Model<BindingRange>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    private readonly jobs: JobsService,
    private readonly catalog: CatalogService,
    private readonly notifier: DispatchNotifier,
  ) {}

  // ------------------------------------------------------------ list

  private conditions(q: DispatchQueryDto): QueryFilter<Job>[] {
    const c: QueryFilter<Job>[] = [];
    if (q.providerId) {
      const id = new Types.ObjectId(q.providerId);
      c.push({ $or: [{ providerId: id }, { deliveryProviderId: id }] });
    }
    if (q.service) c.push({ services: q.service });
    if (q.priority) c.push({ priority: q.priority });
    if (q.deliveryMethod) c.push({ deliveryMethod: q.deliveryMethod });
    if (q.deliveryStatus) c.push(deliveryStatusFilter(q.deliveryStatus) as QueryFilter<Job>);
    if (q.from) c.push({ orderCreatedAt: { $gte: tehranDayStart(q.from) } });
    if (q.to) c.push({ orderCreatedAt: { $lt: addDays(tehranDayStart(q.to), 1) } });
    if (q.q?.trim()) {
      const term = toAsciiDigits(q.q.trim()).replace(/ي/g, 'ی').replace(/ك/g, 'ک');
      const rx = new RegExp(escapeRegex(term), 'i');
      c.push({ $or: [{ orderCode: rx }, { customerName: rx }, { customerPhone: normalizePhone(term) ?? rx }] });
    }
    return c;
  }

  async list(q: DispatchQueryDto): Promise<{ items: DispatchJobRow[]; total: number; page: number; limit: number; counts: Record<DispatchTab, number> }> {
    const { page, limit, skip } = pageParams(q);
    const base = this.conditions(q);
    const tab = q.tab ?? 'unassigned';
    const scope = q.status ? { status: q.status } : dispatchTabFilter(tab);
    const filter = { $and: [...base, scope] } as QueryFilter<Job>;
    const sort: Record<string, 1 | -1> = tab === 'completed' || tab === 'cancelled' ? { updatedAt: -1 } : { deadline: 1, _id: 1 };
    const [items, total, ...counts] = await Promise.all([
      this.jobModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.jobModel.countDocuments(filter),
      ...DISPATCH_TABS.map((t) => this.jobModel.countDocuments({ $and: [...base, dispatchTabFilter(t)] } as QueryFilter<Job>)),
    ]);
    const rows = items as JobRow[];
    const [names, orders] = await Promise.all([this.namesFor(rows), this.orderFacts(rows)]);
    const now = new Date();
    return {
      items: rows.map((j) => {
        const o = orders.get(String(j.orderId));
        return dispatchRow(j, names, o?.status ?? 'registered', o ? orderSummary(o) : '', now);
      }),
      total, page, limit,
      counts: Object.fromEntries(DISPATCH_TABS.map((t, i) => [t, counts[i]])) as Record<DispatchTab, number>,
    };
  }

  private async orderFacts(jobs: JobRow[]) {
    const ids = jobs.map((j) => j.orderId);
    const list = ids.length ? ((await this.orders.find({ _id: { $in: ids } }, { status: 1, children: 1, services: 1 }).lean()) as OrderRow[]) : [];
    return new Map(list.map((o) => [String(o._id), o]));
  }

  /** Names of every provider and admin a job mentions. */
  async namesFor(jobs: Pick<JobRow, 'providerId' | 'deliveryProviderId' | 'history' | 'cancel' | 'assignment'>[]): Promise<Names> {
    const providerIds = new Set<string>();
    const userIds = new Set<string>();
    for (const j of jobs) {
      for (const id of [j.providerId, j.deliveryProviderId, j.cancel?.providerId]) if (id) providerIds.add(String(id));
      if (j.assignment?.assignedBy) userIds.add(String(j.assignment.assignedBy));
      for (const e of j.history ?? []) {
        for (const id of [e.providerId, e.deliveryProviderId, e.previousProviderId]) if (id) providerIds.add(String(id));
        if (e.by) userIds.add(String(e.by));
      }
    }
    const [providers, users] = await Promise.all([
      providerIds.size ? this.centers.find({ _id: { $in: [...providerIds].map((id) => new Types.ObjectId(id)) } }, { name: 1 }).lean() : [],
      userIds.size ? this.users.find({ _id: { $in: [...userIds].map((id) => new Types.ObjectId(id)) } }, { name: 1 }).lean() : [],
    ]);
    const names: Names = new Map();
    for (const p of providers) names.set(String(p._id), p.name);
    for (const u of users) names.set(String(u._id), u.name?.trim() || 'مدیر');
    return names;
  }

  /** Q18: provider prices/fees only for admins with provider_price_view (super-admins included). */
  async canSeeProviderPrices(userId: string): Promise<boolean> {
    return canViewProviderPrices(Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null);
  }

  async detail(id: string, canSeeProviderPrices = false): Promise<DispatchJobDetail> {
    const job = (await this.jobs.byId(id)) as unknown as JobRow;
    const order = (await this.orders.findById(job.orderId).lean()) as OrderRow | null;
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    const names = await this.namesFor([job]);
    return dispatchDetail(job, order, names, jobRequirements(order).map((r) => r.line), orderSummary(order), new Date(), canSeeProviderPrices);
  }

  // ------------------------------------------------------------ eligibility (§51–54)

  /** Today's assigned load per provider (Tehran day, by `assignment.assignedAt`), without `exclude`. */
  private async usageToday(now: Date, exclude: unknown): Promise<Map<string, Usage>> {
    const since = tehranDayStart(tehranYmd(now));
    const rows = await this.jobModel.find({ 'assignment.assignedAt': { $gte: since }, status: { $nin: ['unassigned', 'cancelled'] }, _id: { $ne: exclude } }, { providerId: 1, sheets: 1, units: 1 }).lean();
    const out = new Map<string, Usage>();
    for (const j of rows) {
      if (!j.providerId) continue;
      const u = out.get(String(j.providerId)) ?? { sheets: 0, jobs: 0, units: {} };
      u.sheets += j.sheets ?? 0;
      u.jobs += 1;
      for (const [s, n] of Object.entries(j.units ?? {})) u.units[s as ProviderService] = (u.units[s as ProviderService] ?? 0) + (n ?? 0);
      out.set(String(j.providerId), u);
    }
    return out;
  }

  private async activeJobs(): Promise<Map<string, number>> {
    const rows = await this.jobModel.find({ status: { $in: ACTIVE }, providerId: { $exists: true } }, { providerId: 1 }).lean();
    const out = new Map<string, number>();
    for (const j of rows) out.set(String(j.providerId), (out.get(String(j.providerId)) ?? 0) + 1);
    return out;
  }

  private async zoneIdOf(name?: string): Promise<string | null> {
    if (!name) return null;
    const z = await this.zones.findOne({ name }).lean();
    return z ? String(z._id) : null;
  }

  /** Every provider's effective provider-layer entries now (provider_price_version included). */
  private async providerEntries(at: Date): Promise<Record<string, Record<string, ProviderEntry>>> {
    const rows = (await this.versions.find({ layer: 'provider', state: { $in: ['published', 'disabled'] } }).lean()) as SnapshotRow[];
    return effectiveProviderEntries(rows, at);
  }

  async labelOf(): Promise<{ labelOf: (k: string) => string; paperNames: Map<string, string> }> {
    const [papers, ranges] = await Promise.all([this.papers.find().lean(), this.ranges.find().lean()]);
    const paperNames = new Map(papers.map((p) => [p.key, p.name]));
    const names = { papers: paperNames, ranges: new Map(ranges.map((r) => [String(r._id), { minPages: r.minPages, maxPages: r.maxPages }])) };
    return { labelOf: (k) => providerLineLabel(k, names), paperNames };
  }

  /** One provider against one job: every check and the provider's own price (Task 10's assign uses it too). */
  async evaluate(job: JobRow | JobDocument, order: OrderRow, p: CenterRow, opts: { needsDelivery: boolean; now?: Date }): Promise<{ check: CheckResult; quote: ProviderQuote }> {
    const now = opts.now ?? new Date();
    const [usage, zoneId, entries, labels] = await Promise.all([this.usageToday(now, job._id), this.zoneIdOf(order.zone), this.providerEntries(now), this.labelOf()]);
    const check = checkProvider(factsOf(p), jobRequirements(order), { sheets: job.sheets ?? 0, units: job.units ?? {} }, usage.get(String(p._id)) ?? EMPTY_USAGE,
      { now, orderZoneId: zoneId, needsDelivery: opts.needsDelivery, paperNames: labels.paperNames });
    return { check, quote: providerQuote(order, entries[String(p._id)] ?? {}, labels.labelOf) };
  }

  async eligibility(id: string, deliveryMethod?: DeliveryMethod, canSeeProviderPrices = false): Promise<Eligibility> {
    const job = (await this.jobs.byId(id)) as unknown as JobRow;
    const order = (await this.orders.findById(job.orderId).lean()) as OrderRow | null;
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    const now = new Date();
    const [providers, usage, zoneId, entries, labels, active] = await Promise.all([
      this.centers.find().sort({ name: 1 }).lean() as unknown as Promise<CenterRow[]>,
      this.usageToday(now, job._id), this.zoneIdOf(order.zone), this.providerEntries(now), this.labelOf(), this.activeJobs(),
    ]);
    const reqs = jobRequirements(order);
    const method = deliveryMethod ?? job.deliveryMethod;
    const rows: EligibilityRow[] = providers.map((p) => {
      const id = String(p._id);
      const facts = factsOf(p);
      const check = checkProvider(facts, reqs, { sheets: job.sheets ?? 0, units: job.units ?? {} }, usage.get(id) ?? EMPTY_USAGE,
        { now, orderZoneId: zoneId, needsDelivery: method === 'provider', paperNames: labels.paperNames });
      const q = providerQuote(order, entries[id] ?? {}, labels.labelOf);
      return {
        providerId: id, name: p.name, businessName: p.businessName ?? '', status: facts.status, current: !!job.providerId && String(job.providerId) === id,
        eligible: check.eligible, assignable: check.assignable, checks: check.checks,
        priced: q.subtotal !== null, priceMissing: q.missing.map((m) => m.label),
        price: canSeeProviderPrices ? { subtotal: q.subtotal, missing: q.missing.map((m) => m.label), lines: q.lines.map((l) => ({ label: l.label, unitPrice: l.unitPrice, quantity: l.quantity, subtotal: l.subtotal })) } : null,
        capacityLeft: check.capacityLeft, ...(typeof p.capacity?.hourlySheets === 'number' ? { hourlySheets: p.capacity.hourlySheets } : {}),
        openNow: check.openNow, activeJobs: active.get(id) ?? 0, hasLogin: !!p.userId,
        canDeliver: !!p.canDeliver, deliveryFee: canSeeProviderPrices ? (p.deliveryFee ?? 0) : null, allowCustomerPickup: !!p.allowCustomerPickup,
      };
    });
    return {
      jobId: String(job._id), requirements: reqs.map((r) => r.line),
      eligible: rows.filter((r) => r.eligible),
      others: rows.filter((r) => !r.eligible).sort((a, b) => Number(b.assignable) - Number(a.assignable)),
      deliveryProviders: providers.filter((p) => p.canDeliver && !['inactive', 'suspended'].includes(p.status ?? 'active')).map((p) => {
        const zones = (p.serviceZoneIds ?? []).map(String);
        const status = p.status ?? 'active';
        return { id: String(p._id), name: p.name, deliveryFee: canSeeProviderPrices ? (p.deliveryFee ?? 0) : null, zoneOk: !zones.length || !zoneId || zones.includes(zoneId), status, ...(status === 'busy' ? { reason: 'مجری فعلاً مشغول است' } : {}) };
      }),
    };
  }

  // ------------------------------------------------------------ writes (§54, §60, §61, §71)

  async requirePermission(userId: string, permission: Permission): Promise<void> {
    const u = Types.ObjectId.isValid(userId) ? await this.users.findById(userId, { role: 1, permissions: 1 }).lean() : null;
    if (!u || u.role !== 'admin' || (u.permissions && !u.permissions.includes(permission))) throw new ForbiddenException('به این بخش دسترسی ندارید');
  }

  /** Every write answers with the detail, redacted for the caller (Q18). */
  private async result(id: unknown, by: string): Promise<DispatchJobDetail> {
    return this.detail(String(id), await this.canSeeProviderPrices(by));
  }

  private async liveOrder(orderId: unknown): Promise<OrderRow> {
    const order = (await this.orders.findById(orderId).lean()) as OrderRow | null;
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.status === 'cancelled' || order.status === 'delivered') throw new BadRequestException('این سفارش لغو یا تحویل شده است');
    if (order.status === 'pending_payment') throw new BadRequestException('این سفارش هنوز پرداخت نشده است');
    return order;
  }

  private async providerById(id: string): Promise<CenterRow> {
    assertObjectId(id, 'مجری');
    const p = (await this.centers.findById(id).lean()) as CenterRow | null;
    if (!p) throw new NotFoundException('مجری یافت نشد');
    return p;
  }

  /** Contract «Delivery»: courier ↔ provider for a home delivery, point ↔ provider shop for a pickup; never flips the customer's choice. */
  private async resolveJobDelivery(order: OrderRow, p: CenterRow | null, dto: { deliveryMethod?: DeliveryMethod; deliveryProviderId?: string; pickupAt?: PickupAt }): Promise<ResolvedJobDelivery> {
    const current = deliveryOf(order);
    const pickup = current.method === 'customer_pickup';
    const method: DeliveryMethod = dto.deliveryMethod ?? (pickup ? 'customer_pickup' : 'courier');
    if ((method === 'customer_pickup') !== pickup) throw new BadRequestException('روش تحویل انتخابی مشتری (ارسال یا تحویل حضوری) تغییر نمی‌کند');
    if (method === 'provider') {
      const dp = dto.deliveryProviderId ? await this.providerById(dto.deliveryProviderId) : p;
      if (!dp || !dp.canDeliver || (dp.status ?? 'active') !== 'active') throw new BadRequestException('مجری تحویل باید فعال باشد و امکان ارسال داشته باشد');
      return { method, deliveryProviderId: dp._id, fee: dp.deliveryFee ?? 0, orderDelivery: { ...current, method } };
    }
    const { providerShop: _shop, pickupAt: _at, ...rest } = current;
    if (method === 'customer_pickup') {
      const pickupAt: PickupAt = dto.pickupAt ?? 'point';
      if (pickupAt === 'provider') {
        if (!p) throw new BadRequestException('ابتدا مجری سفارش را تعیین کنید');
        if (!p.allowCustomerPickup) throw new BadRequestException('تحویل حضوری در محل این مجری مجاز نیست');
        const h = p.workingHours?.[0];
        const providerShop = { id: String(p._id), name: p.businessName || p.name, address: p.address ?? '', phone: p.phone ?? '', hours: h ? faDigits(`${h.from} تا ${h.to}`) : '', kind: 'provider' as const };
        return { method, pickupAt, fee: 0, orderDelivery: { ...rest, method, pickupAt, providerShop } };
      }
      return { method, pickupAt, fee: 0, orderDelivery: { ...rest, method, pickupAt } };
    }
    return { method: 'courier', fee: 0, orderDelivery: { ...rest, method: 'courier' } };
  }

  async assign(id: string, dto: AssignJobDto, by: string): Promise<DispatchJobDetail> {
    const job = await this.jobs.byId(id);
    if (job.status !== 'unassigned') throw new ConflictException('این سفارش قبلاً تخصیص داده شده است؛ برای تغییر مجری از «تغییر مجری» استفاده کنید');
    return this.give(job, dto, by, 'assigned');
  }

  async reassign(id: string, dto: AssignJobDto, by: string): Promise<DispatchJobDetail> {
    const job = await this.jobs.byId(id);
    if (!HELD.includes(job.status)) throw new BadRequestException(NOT_CHANGEABLE);
    if (!dto.reason?.trim()) throw new BadRequestException('دلیل را بنویسید');
    if (String(job.providerId) === dto.providerId) throw new BadRequestException('این سفارش هم‌اکنون به همین مجری سپرده شده است');
    return this.give(job, dto, by, 'reassigned');
  }

  /** Assign / reassign: hard checks never pass (§86), soft ones need override + reason (§71), a missing price needs confirmation (§53). */
  private async give(job: JobDocument, dto: AssignJobDto, by: string, action: 'assigned' | 'reassigned'): Promise<DispatchJobDetail> {
    const order = await this.liveOrder(job.orderId);
    const p = await this.providerById(dto.providerId);
    const delivery = await this.resolveJobDelivery(order, p, dto);
    const { check, quote } = await this.evaluate(job, order, p, { needsDelivery: false });
    if (!check.assignable) throw new BadRequestException({ statusCode: 400, code: 'NOT_CAPABLE', message: 'این مجری توانایی انجام این سفارش را ندارد', problems: check.hardProblems });
    const overriding = !check.eligible;
    if (overriding && !dto.override) {
      throw new ConflictException({ statusCode: 409, code: 'PROVIDER_NOT_ELIGIBLE', message: 'این مجری شرایط دریافت سفارش را ندارد؛ برای تخصیص با وجود این شرایط دلیل را بنویسید', problems: check.problems });
    }
    if (overriding && !dto.reason?.trim()) throw new BadRequestException('دلیل نادیده‌گرفتن شرایط را بنویسید');
    if (quote.subtotal === null && !dto.confirmMissingPrice) {
      throw new ConflictException({ statusCode: 409, code: 'PROVIDER_PRICE_MISSING', message: 'قیمت مجری تنظیم نشده', missing: quote.missing.map((m) => m.label) });
    }
    const now = new Date();
    const { dispatch } = await this.catalog.getSettings();
    const snapshot = pricingSnapshot({
      providerId: String(p._id), quote, at: now, confirmedMissing: quote.subtotal === null,
      delivery: delivery.deliveryProviderId ? { providerId: String(delivery.deliveryProviderId), fee: delivery.fee } : null,
    });
    const assignment = {
      id: new Types.ObjectId(), providerId: p._id, assignedBy: new Types.ObjectId(by), assignedAt: now,
      respondBy: new Date(now.getTime() + dispatch.responseTimeoutMinutes * 60_000),
      ...(overriding ? { override: { reason: dto.reason!.trim(), problems: check.problems } } : {}),
    };
    const prev = job.providerId;
    const oldDp = job.deliveryProviderId;
    const history = this.jobs.entry({ providerId: p._id, deliveryProviderId: delivery.deliveryProviderId }, action, 'assigned', { byRole: 'admin', by, reason: dto.reason }, now, {
      ...(prev ? { previousProviderId: prev, stage: cancelStage(job.status) } : {}), ...(overriding ? { override: true } : {}),
    });
    const updated = await this.jobs.cas(job, 'assigned', {
      extraGuard: prev ? { providerId: prev } : { providerId: { $exists: false } },
      set: {
        providerId: p._id, assignment, providerPricing: snapshot, deliveryMethod: delivery.method,
        ...(delivery.deliveryProviderId ? { deliveryProviderId: delivery.deliveryProviderId } : {}), ...(delivery.pickupAt ? { pickupAt: delivery.pickupAt } : {}),
      },
      ...(delivery.deliveryProviderId ? {} : { unset: { deliveryProviderId: 1 } }),
      ...(prev ? { addToSet: { releasedProviderIds: prev } } : {}),
      inc: { attempts: 1 }, push: { pricingHistory: snapshot }, history,
    });
    if (!updated) throw raced();
    // the order follows the job: guarded so a late write never replaces a newer provider's snapshot or touches a closed order
    const res = await this.orders.updateOne(
      { _id: order._id, status: { $nin: ['cancelled', 'delivered'] }, $or: [{ centerId: { $exists: false } }, ...(prev ? [{ centerId: prev }] : [])] },
      { $set: { centerId: p._id, providerPricing: snapshot, delivery: delivery.orderDelivery }, $inc: { __v: 1 } },
    );
    if (!res.matchedCount) this.logger.warn(`order ${order.code}: provider snapshot not written (the order changed meanwhile)`);
    if (prev) await this.notifier.provider('job_withdrawn', prev, updated);
    if (oldDp && String(oldDp) !== String(prev) && String(oldDp) !== String(delivery.deliveryProviderId)) await this.notifier.provider('job_withdrawn', oldDp, updated);
    await this.notifier.provider('job_assigned', p._id, updated);
    if (delivery.deliveryProviderId && String(delivery.deliveryProviderId) !== String(p._id)) await this.notifier.provider('job_delivery_assigned', delivery.deliveryProviderId, updated);
    return this.result(updated._id, by);
  }

  async unassign(id: string, reason: string, by: string): Promise<DispatchJobDetail> {
    const job = await this.jobs.byId(id);
    if (!HELD.includes(job.status)) throw new BadRequestException(NOT_CHANGEABLE);
    await this.jobs.giveBack(job, 'unassigned', { byRole: 'admin', by, reason });
    return this.result(job._id, by);
  }

  async updateDelivery(id: string, dto: DeliveryChangeDto, by: string): Promise<DispatchJobDetail> {
    const job = await this.jobs.byId(id);
    if (!(['unassigned', ...HELD, 'ready'] as JobStatus[]).includes(job.status)) throw new BadRequestException('روش تحویل این سفارش دیگر قابل تغییر نیست');
    const order = await this.liveOrder(job.orderId);
    const p = job.providerId ? await this.providerById(String(job.providerId)) : null;
    const d = await this.resolveJobDelivery(order, p, dto);
    const now = new Date();
    const pp = job.providerPricing;
    const pricing = pp
      ? { ...pp, delivery: d.deliveryProviderId ? { providerId: String(d.deliveryProviderId), fee: d.fee } : null,
          payoutBasis: pp.providerSubtotal === null ? null : pp.providerSubtotal + (d.deliveryProviderId && String(d.deliveryProviderId) === pp.providerId ? d.fee : 0) }
      : undefined;
    const oldDp = job.deliveryProviderId;
    const updated = await this.jobs.cas(job, job.status, {
      set: { deliveryMethod: d.method, ...(d.pickupAt ? { pickupAt: d.pickupAt } : {}), ...(d.deliveryProviderId ? { deliveryProviderId: d.deliveryProviderId } : {}), ...(pricing ? { providerPricing: pricing } : {}) },
      ...(d.deliveryProviderId ? {} : { unset: { deliveryProviderId: 1 } }),
      history: this.jobs.entry({ providerId: job.providerId, deliveryProviderId: d.deliveryProviderId }, 'delivery_changed', job.status, { byRole: 'admin', by, reason: dto.reason }, now),
    });
    if (!updated) throw raced();
    const res = await this.orders.updateOne(
      { _id: order._id, status: { $nin: ['cancelled', 'delivered'] }, ...(job.providerId ? { centerId: job.providerId } : {}) },
      { $set: { delivery: d.orderDelivery, ...(pricing ? { providerPricing: pricing } : {}) }, $inc: { __v: 1 } },
    );
    if (!res.matchedCount) this.logger.warn(`order ${order.code}: delivery change not written to the order (it changed meanwhile)`);
    if (job.providerId) await this.notifier.provider('job_changed', job.providerId, updated);
    if (oldDp && String(oldDp) !== String(job.providerId) && String(oldDp) !== String(d.deliveryProviderId)) await this.notifier.provider('job_withdrawn', oldDp, updated);
    if (d.deliveryProviderId && String(d.deliveryProviderId) !== String(job.providerId) && String(d.deliveryProviderId) !== String(oldDp)) await this.notifier.provider('job_delivery_assigned', d.deliveryProviderId, updated);
    return this.result(job._id, by);
  }

  async update(id: string, dto: UpdateJobDto, by: string): Promise<DispatchJobDetail> {
    const job = await this.jobs.byId(id);
    if (!LIVE.includes(job.status)) throw new BadRequestException('این سفارش لغو یا تحویل شده است');
    const deadline = dto.deadline ? new Date(dto.deadline) : undefined;
    if (!dto.priority && !deadline) return this.result(job._id, by);
    const updated = await this.jobs.cas(job, job.status, {
      set: { ...(dto.priority ? { priority: dto.priority } : {}), ...(deadline ? { deadline } : {}) },
      ...(deadline ? { unset: { deadlineNotifiedAt: 1, lateAlertedAt: 1 } } : {}),
      history: this.jobs.entry(job, 'updated', job.status, { byRole: 'admin', by }, new Date()),
    });
    if (!updated) throw raced();
    if (deadline && job.providerId) await this.notifier.provider('job_changed', job.providerId, updated);
    return this.result(job._id, by);
  }

  /** On behalf of the provider (`provider_order_accept`), e.g. after a phone call. */
  async respond(id: string, dto: RespondDto, by: string): Promise<DispatchJobDetail> {
    if (!dto.reason?.trim()) throw new BadRequestException('دلیل را بنویسید');
    const job = await this.jobs.byId(id);
    if (dto.accept) await this.jobs.move(String(job._id), 'accepted', { actor: 'admin', byRole: 'admin', by, reason: dto.reason });
    else await this.jobs.giveBack(job, 'rejected', { byRole: 'admin', by, reason: dto.reason, reasonCode: dto.reasonCode ?? 'other', ...(job.assignment ? { assignmentId: String(job.assignment.id) } : {}) });
    return this.result(job._id, by);
  }

  /** On behalf of the provider/courier (`provider_order_status`), incl. «تکمیل» and pickups at a Digital Sarv point. */
  async setStatus(id: string, dto: AdminJobStatusDto, by: string): Promise<DispatchJobDetail> {
    if (!dto.reason?.trim()) throw new BadRequestException('دلیل را بنویسید');
    const job = await this.jobs.byId(id);
    await this.jobs.move(String(job._id), dto.status, { actor: 'admin', byRole: 'admin', by, reason: dto.reason, reasonCode: dto.reasonCode });
    return this.result(job._id, by);
  }

  /** v1 `PATCH /admin/orders/:id/assign { centerId }` — delegated with the dispatch permissions (the v1 route has none). */
  async assignFromOrder(orderId: string, centerId: string | null, by: string): Promise<void> {
    assertObjectId(orderId, 'سفارش');
    let job = await this.jobs.forOrder(new Types.ObjectId(orderId));
    if (!job) {
      const order = await this.liveOrder(new Types.ObjectId(orderId));
      job = await this.jobs.ensureJob(order as never);
      if (!job) throw new NotFoundException('سفارش یافت نشد');
    }
    if (centerId === null) {
      if (!HELD.includes(job.status)) return;
      await this.requirePermission(by, 'dispatch_reassign');
      await this.unassign(String(job._id), 'لغو از صفحه سفارش', by);
      return;
    }
    if (job.status === 'unassigned') {
      await this.requirePermission(by, 'dispatch_assign');
      await this.assign(String(job._id), { providerId: centerId } as AssignJobDto, by);
      return;
    }
    await this.requirePermission(by, 'dispatch_reassign');
    await this.reassign(String(job._id), { providerId: centerId, reason: 'تغییر از صفحه سفارش' } as AssignJobDto, by);
  }
}
