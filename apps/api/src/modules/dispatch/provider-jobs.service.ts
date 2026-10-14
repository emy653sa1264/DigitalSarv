import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JOB_STATUS_LABELS, REJECT_REASON_LABELS } from '../../common/constants.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { pageParams } from '../../common/utils/pagination.js';
import { Color } from '../catalog/schemas/color.schema.js';
import { Extra } from '../catalog/schemas/extra.schema.js';
import { Center } from '../centers/center.schema.js';
import { orderSummary, qcLabelsOf } from '../orders/order-helpers.js';
import { Order } from '../orders/order.schema.js';
import { draftFileRefs, isObjectIdString } from '../uploads/upload-rules.js';
import { Upload, uploadJson } from '../uploads/upload.schema.js';
import type { ProviderJobStatusDto, ProviderJobsQueryDto, RejectJobDto } from './dto/dispatch.dto.js';
import {
  providerJobDetail, providerJobView, providerLines, rolesOf, withdrawnView,
  type JobRow, type ProviderJobDetail, type ProviderJobView, type ProviderWithdrawnView, type UploadView,
} from './job-json.js';
import { DELIVERY_VISIBLE, FILE_STATUSES, PROVIDER_TABS, canMove, providerTabFilter, type ProviderTab } from './job-model.js';
import { Job } from './job.schema.js';
import { JobsService, raced } from './jobs.service.js';

type OrderRow = Order & { _id: Types.ObjectId };
const NOT_FOUND = 'سفارش یافت نشد';

/** «سرو مجری» orders (§57–59): only the caller's jobs, with the information it is allowed to see (§62, §64). */
@Injectable()
export class ProviderJobsService {
  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(Upload.name) private readonly uploads: Model<Upload>,
    @InjectModel(Color.name) private readonly colors: Model<Color>,
    @InjectModel(Extra.name) private readonly extras: Model<Extra>,
    private readonly jobs: JobsService,
  ) {}

  private tabFilter(tab: ProviderTab, pid: Types.ObjectId): Record<string, unknown> {
    if (tab === 'cancelled') return { $or: [{ providerId: pid, status: 'cancelled' }, { releasedProviderIds: pid, providerId: { $ne: pid } }] };
    return providerTabFilter(tab, pid);
  }

  async list(providerId: string, q: ProviderJobsQueryDto): Promise<{ items: (ProviderJobView | ProviderWithdrawnView)[]; total: number; page: number; limit: number; counts: Record<ProviderTab, number> }> {
    const pid = new Types.ObjectId(providerId);
    const { page, limit, skip } = pageParams(q);
    const tab = q.tab ?? 'new';
    const filter = this.tabFilter(tab, pid);
    const sort: Record<string, 1 | -1> = tab === 'completed' || tab === 'cancelled' ? { updatedAt: -1 as const } : { deadline: 1 as const, _id: 1 as const };
    const [rows, total, ...counts] = await Promise.all([
      this.jobModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.jobModel.countDocuments(filter),
      ...PROVIDER_TABS.map((t) => this.jobModel.countDocuments(this.tabFilter(t, pid))),
    ]);
    const jobs = rows as JobRow[];
    const ids = jobs.map((j) => j.orderId);
    const orders = ids.length ? ((await this.orders.find({ _id: { $in: ids } }, { children: 1, services: 1 }).lean()) as OrderRow[]) : [];
    const summaries = new Map(orders.map((o) => [String(o._id), orderSummary(o)]));
    const now = new Date();
    return {
      items: jobs.map((j) => (tab === 'cancelled' && String(j.providerId) !== providerId ? withdrawnView(j, providerId) : providerJobView(j, providerId, summaries.get(String(j.orderId)) ?? '', now))),
      total, page, limit,
      counts: Object.fromEntries(PROVIDER_TABS.map((t, i) => [t, counts[i]])) as Record<ProviderTab, number>,
    };
  }

  /** The caller's job (production holder, or delivery provider from `ready` on) — anything else is 404. */
  private async own(providerId: string, id: string): Promise<JobRow> {
    assertObjectId(id, 'سفارش');
    const pid = new Types.ObjectId(providerId);
    const job = await this.jobModel.findOne({ _id: new Types.ObjectId(id), $or: [{ providerId: pid }, { deliveryProviderId: pid, status: { $in: DELIVERY_VISIBLE } }] }).lean();
    if (!job) throw new NotFoundException(NOT_FOUND);
    return job as JobRow;
  }

  private async render(job: JobRow, providerId: string, userId?: string): Promise<ProviderJobDetail> {
    const order = (await this.orders.findById(job.orderId).lean()) as OrderRow | null;
    if (!order) throw new NotFoundException(NOT_FOUND);
    const production = rolesOf(job, providerId).includes('production');
    const [colors, extras, files, collectFrom] = await Promise.all([
      production ? this.colors.find().lean() : [],
      production ? this.extras.find().lean() : [],
      production && FILE_STATUSES.includes(job.status) ? this.files(order) : [],
      !production && job.providerId ? this.collectFrom(job.providerId) : null,
    ]);
    const names = { colors: new Map(colors.map((c) => [c.key, c.name])), extras: new Map(extras.map((x) => [x.key, x.label])) };
    return providerJobDetail(job, order, providerId, { summary: orderSummary(order), lines: production ? providerLines(order, names) : [], files, collectFrom, now: new Date(), userId });
  }

  /** The order's line files (never the courier's pickup photos, §65). */
  private async files(order: OrderRow): Promise<UploadView[]> {
    const ids = [...new Set(draftFileRefs(order.services).map((r) => r.id).filter(isObjectIdString))];
    if (!ids.length) return [];
    const docs = await this.uploads.find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, purpose: { $ne: 'pickup' }, deletedAt: { $exists: false } }).lean();
    return docs.map((d) => uploadJson(d as never));
  }

  private async collectFrom(providerId: unknown): Promise<ProviderJobDetail['collectFrom']> {
    const c = await this.centers.findById(providerId, { name: 1, businessName: 1, address: 1, phone: 1 }).lean();
    return c ? { name: c.businessName || c.name, address: c.address ?? '', phone: c.phone ?? '' } : null;
  }

  async detail(providerId: string, id: string, userId?: string): Promise<ProviderJobDetail> {
    let job = await this.own(providerId, id);
    if (job.status === 'assigned' && String(job.providerId) === providerId && !job.assignment?.seenAt) {
      await this.jobModel.updateOne({ _id: job._id, status: 'assigned', providerId: new Types.ObjectId(providerId), 'assignment.id': job.assignment?.id, 'assignment.seenAt': { $exists: false } }, { $set: { 'assignment.seenAt': new Date() } });
      job = await this.own(providerId, id);
    }
    return this.render(job, providerId, userId);
  }

  private assertWaiting(job: JobRow, providerId: string) {
    if (job.status !== 'assigned' || String(job.providerId) !== providerId) throw new BadRequestException('این سفارش منتظر پاسخ شما نیست');
  }

  async accept(providerId: string, id: string, userId: string): Promise<ProviderJobDetail> {
    const job = await this.own(providerId, id);
    this.assertWaiting(job, providerId);
    await this.jobs.move(id, 'accepted', { actor: 'production', byRole: 'provider', by: userId, providerId, ...(job.assignment ? { assignmentId: String(job.assignment.id) } : {}) });
    return this.render(await this.own(providerId, id), providerId, userId);
  }

  async reject(providerId: string, id: string, dto: RejectJobDto, userId: string): Promise<{ ok: true }> {
    const job = await this.own(providerId, id);
    this.assertWaiting(job, providerId);
    if (dto.reasonCode === 'other' && !dto.note?.trim()) throw new BadRequestException('برای «سایر» توضیح بنویسید');
    await this.jobs.giveBack(job as never, 'rejected', {
      byRole: 'provider', by: userId, providerId, reasonCode: dto.reasonCode, reason: dto.note?.trim() || REJECT_REASON_LABELS[dto.reasonCode],
      ...(job.assignment ? { assignmentId: String(job.assignment.id) } : {}),
    });
    return { ok: true };
  }

  async setStatus(providerId: string, id: string, dto: ProviderJobStatusDto, userId: string): Promise<ProviderJobDetail | { ok: true }> {
    const job = await this.own(providerId, id);
    if (job.status === 'cancelled') throw new BadRequestException('این سفارش لغو شده است');
    const ctx = { method: job.deliveryMethod, pickupAt: job.pickupAt };
    const actor = rolesOf(job, providerId).find((r) => canMove(job.status, dto.status, r, ctx));
    if (!actor) throw new BadRequestException(`تغییر وضعیت از «${JOB_STATUS_LABELS[job.status]}» به «${JOB_STATUS_LABELS[dto.status]}» مجاز نیست`);
    if (dto.status === 'failed' && !dto.reasonCode) throw new BadRequestException('دلیل را انتخاب کنید');
    if (dto.status === 'failed' && dto.reasonCode === 'other' && !dto.note?.trim()) throw new BadRequestException('برای «سایر» توضیح بنویسید');
    await this.jobs.move(id, dto.status, {
      actor, byRole: 'provider', by: userId, providerId, reasonCode: dto.reasonCode,
      ...(job.assignment ? { assignmentId: String(job.assignment.id) } : {}),
      reason: dto.note?.trim() || (dto.reasonCode ? REJECT_REASON_LABELS[dto.reasonCode] : undefined),
    });
    if (dto.status === 'failed') return { ok: true };
    return this.render(await this.own(providerId, id), providerId, userId);
  }

  /** The production provider ticks the order's QC checklist (the `ready` step needs it complete). One item per write. */
  async setQc(providerId: string, id: string, index: number, done: boolean, userId?: string): Promise<ProviderJobDetail> {
    const job = await this.own(providerId, id);
    if (String(job.providerId) !== providerId || !['accepted', 'in_production'].includes(job.status)) {
      throw new BadRequestException('چک‌لیست کنترل کیفیت فقط حین انجام سفارش ثبت می‌شود');
    }
    const order = (await this.orders.findById(job.orderId).lean()) as OrderRow | null;
    if (!order) throw new NotFoundException(NOT_FOUND);
    if (index >= qcLabelsOf(order).length) throw new BadRequestException('ردیف چک‌لیست معتبر نیست');
    // the job guard (holder, assignment, status) is one atomic write; the order write is then guarded by the order status
    const held = await this.jobModel.updateOne(
      { _id: job._id, providerId: job.providerId, 'assignment.id': job.assignment?.id, status: { $in: ['accepted', 'in_production'] } },
      { $set: { updatedAt: new Date() } },
    );
    if (!held.modifiedCount) throw raced();
    const res = await this.orders.updateOne({ _id: order._id, status: { $nin: ['packing', 'out_for_delivery', 'delivered', 'cancelled'] } }, { $set: { [`qc.${index}`]: done }, $inc: { __v: 1 } });
    if (!res.modifiedCount) throw raced();
    return this.render(await this.own(providerId, id), providerId, userId);
  }
}
