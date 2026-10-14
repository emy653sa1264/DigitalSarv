import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import type { Permission } from '../../common/permissions.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { User } from '../users/user.schema.js';
import { COLOR_TYPES, comboKey, parseCombo, PRINT_ADDONS, PRINT_SIZES, SIDES, singleSideKey, type ComboOptions, type ComboService } from './combo.js';
import { bulkValue, type BulkOp } from './bulk.js';
import { validateFormula } from './formula.js';
import { comboLabel, type LabelNames } from './labels.js';
import { CUSTOMER_FORMULA_VARS, ROUNDINGS, type DisplayStatus, type PriceLayer, type PriceMode } from './price-book.constants.js';
import { rangeProblem } from './ranges.js';
import { displayStatus, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import { BindingRange } from './schemas/binding-range.schema.js';
import { PriceAudit, type PriceAuditAction } from './schemas/price-audit.schema.js';
import { PriceVersion } from './schemas/price-version.schema.js';
import { toVersionLike } from './snapshot.js';

export interface CreateVersionInput {
  layer: 'customer'; comboKey: string; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding?: number;
  effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string;
}
export type PreviewInput = Pick<CreateVersionInput, 'comboKey' | 'mode' | 'price' | 'formula' | 'markup' | 'discount' | 'rounding'>;
export interface VersionView {
  id: string; layer: PriceLayer; providerId: string | null; comboKey: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number;
  effectiveFrom: string; effectiveUntil?: string; state: VersionLike['state']; status: DisplayStatus;
  reason: string; createdBy?: { id: string; name: string }; createdAt: string; unitPrice: number | null;
}
export interface MatrixRow { comboKey: string; service: ComboService; options: ComboOptions; label: string; current: VersionView | null; next: VersionView | null }

export interface BulkInput {
  layer: 'customer';
  filter: { service?: ComboService; size?: string; colorType?: string; paper?: string; side?: string; comboKeys?: string[] };
  op: BulkOp; value: number; rounding?: number; effectiveFrom?: string;
}
export interface BulkPreview {
  rows: { comboKey: string; label: string; current: number; next: number }[];
  skipped: { comboKey: string; label: string; reason: string }[];
}

type Row = PriceVersion & { _id: Types.ObjectId };
const MAX_PRICE = 1_000_000_000;

@Injectable()
export class PriceBookService {
  constructor(
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    @InjectModel(PriceAudit.name) private readonly audits: Model<PriceAudit>,
    @InjectModel(BindingRange.name) private readonly ranges: Model<BindingRange>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly catalog: CatalogService,
  ) {}

  /** Throws unless the admin holds `permission` (absent `User.permissions` = every permission). */
  async assertCan(userId: string, permission: Permission): Promise<void> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null;
    if (!user || user.role !== 'admin' || (user.permissions && !user.permissions.includes(permission))) {
      throw new ForbiddenException('به این بخش دسترسی ندارید');
    }
  }

  // ------------------------------------------------------------ reads

  async matrix(layer: 'customer', service?: ComboService, at = new Date()): Promise<MatrixRow[]> {
    const [papers, ranges, rows] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find({ layer, providerId: null }).lean() as Promise<Row[]>,
    ]);
    const names = this.names(papers, ranges);
    const keys: string[] = [];
    for (const size of PRINT_SIZES) for (const side of SIDES) keys.push(comboKey({ service: 'bw', size, side }));
    for (const size of PRINT_SIZES) for (const colorType of COLOR_TYPES) for (const p of papers.filter((x) => x.colorPrint)) for (const side of SIDES) {
      keys.push(comboKey({ service: 'color', size, colorType, paper: p.key, side }));
    }
    for (const r of ranges) keys.push(comboKey({ service: 'spiral', rangeId: String(r._id) }));
    for (const addon of PRINT_ADDONS) {
      if (addon === 'lam_sheet') for (const size of PRINT_SIZES) keys.push(comboKey({ service: 'addon', addon, size }));
      else keys.push(comboKey({ service: 'addon', addon }));
    }
    for (const r of rows) if (!keys.includes(r.comboKey)) keys.push(r.comboKey);

    const users = await this.userNames(rows);
    const vars = await this.varsLoader(rows, papers, at);
    const out: MatrixRow[] = [];
    for (const key of keys) {
      const options = parseCombo(key);
      if (!options || (service && options.service !== service)) continue;
      const list = rows.filter((r) => r.comboKey === key);
      const likes = list.map(toVersionLike);
      const eff = pickEffective(likes, at);
      const future = likes
        .filter((v) => v.state === 'published' && v.effectiveFrom.getTime() > at.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
      const view = (id?: string) => {
        const r = id ? list.find((x) => String(x._id) === id) : undefined;
        return r ? this.view(r, eff?.id ?? null, at, users, vars(key)) : null;
      };
      out.push({ comboKey: key, service: options.service, options, label: comboLabel(options, names), current: view(eff?.id), next: view(future?.id) });
    }
    return out;
  }

  async history(layer: 'customer', comboKey: string, at = new Date()): Promise<VersionView[]> {
    const rows = (await this.versions.find({ layer, providerId: null, comboKey }).lean()) as Row[];
    const eff = pickEffective(rows.map(toVersionLike), at);
    const users = await this.userNames(rows);
    const papers = await this.papers.find().lean();
    const vars = await this.varsLoader(rows, papers, at);
    return rows
      .sort((a, b) => b.version - a.version)
      .map((r) => this.view(r, eff?.id ?? null, at, users, vars(comboKey)));
  }

  async preview(input: PreviewInput): Promise<{ unitPrice: number | null; error?: string }> {
    const problem = this.valueProblem(input);
    if (problem) return { unitPrice: null, error: problem };
    const papers = await this.papers.find().lean();
    const rows = (await this.versions.find({ layer: 'customer', providerId: null }).lean()) as Row[];
    const vars = (await this.varsLoader(rows, papers, new Date()))(input.comboKey);
    const value = unitPrice(
      { id: 'preview', version: 0, state: 'published', effectiveFrom: new Date(), mode: input.mode, price: input.price, formula: input.formula, markup: input.markup, discount: input.discount, rounding: input.rounding ?? 0 },
      vars,
    );
    return value === null ? { unitPrice: null, error: 'با مقادیر فعلی قابل محاسبه نیست (قیمت پایه یا هزینه کاغذ را بررسی کنید)' } : { unitPrice: value };
  }

  // ------------------------------------------------------------ writes

  async create(input: CreateVersionInput, by: string): Promise<VersionView> {
    if (input.layer !== 'customer') throw new BadRequestException('در این مرحله فقط قیمت مشتری قابل ثبت است');
    if (!parseCombo(input.comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    const problem = this.valueProblem(input);
    if (problem) throw new BadRequestException(problem);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const effectiveUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : undefined;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveUntil && Number.isNaN(effectiveUntil.getTime()))) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveUntil && effectiveUntil.getTime() <= effectiveFrom.getTime()) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    if (input.publish && input.effectiveFrom && (await this.versions.exists({ layer: 'customer', providerId: null, comboKey: input.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const doc = await this.insertVersion({
      layer: 'customer', providerId: null, comboKey: input.comboKey, mode: input.mode,
      ...(input.mode === 'manual' ? { price: input.price } : { formula: input.formula!.trim() }),
      ...(input.markup !== undefined ? { markup: input.markup } : {}),
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      rounding: input.rounding ?? 0, effectiveFrom, ...(effectiveUntil ? { effectiveUntil } : {}),
      state: input.publish ? 'published' : 'draft', reason, createdBy: new Types.ObjectId(by),
    });
    const action: PriceAuditAction = !input.publish ? 'create' : effectiveFrom.getTime() > Date.now() ? 'schedule' : 'publish';
    await this.audit(action, [doc], reason, by, undefined, this.plain(doc));
    if (input.publish) await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  async publish(id: string, reason: string, by: string): Promise<VersionView> {
    return this.transition(id, 'draft', 'published', 'publish', reason, by);
  }

  async disable(id: string, reason: string, by: string): Promise<VersionView> {
    return this.transition(id, 'published', 'disabled', 'disable', reason, by);
  }

  async rollback(id: string, reason: string, by: string): Promise<VersionView> {
    const src = (await this.findVersion(id)) as Row;
    const why = this.reason(reason);
    if (src.state !== 'published' && src.state !== 'disabled') throw new BadRequestException('فقط نسخه‌های منتشرشده قابل بازگردانی هستند');
    const doc = await this.insertVersion({
      layer: src.layer, providerId: src.providerId, comboKey: src.comboKey, mode: src.mode,
      ...(src.price !== undefined ? { price: src.price } : {}), ...(src.formula ? { formula: src.formula } : {}),
      ...(src.markup !== undefined ? { markup: src.markup } : {}), ...(src.discount !== undefined ? { discount: src.discount } : {}),
      rounding: src.rounding ?? 0, effectiveFrom: new Date(), state: 'published', reason: why,
      createdBy: new Types.ObjectId(by), rollbackOf: src._id,
    });
    await this.catalog.invalidate();
    await this.audit('rollback', [doc], why, by, this.plain(src), this.plain(doc));
    return this.viewOne(doc);
  }

  async auditLog(page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      this.audits.find().sort({ at: -1 }).skip(skip).limit(limit).lean(),
      this.audits.countDocuments(),
    ]);
    const names = await this.namesOf(items.map((a) => a.by).filter(Boolean) as Types.ObjectId[]);
    return {
      items: items.map((a) => ({
        id: String(a._id), action: a.action, layer: a.layer, comboKeys: a.comboKeys, reason: a.reason,
        at: new Date(a.at).toISOString(), before: a.before, after: a.after,
        ...(a.by ? { by: { id: String(a.by), name: names.get(String(a.by)) ?? '' } } : {}),
      })),
      total, page, limit,
    };
  }

  // ------------------------------------------------------------ bulk

  async bulkPreview(input: BulkInput): Promise<BulkPreview> {
    if (input.layer !== 'customer') throw new BadRequestException('در هر عملیات فقط یک لایه قیمت (مشتری) مجاز است');
    if (!Number.isInteger(input.value) || input.value < 0) throw new BadRequestException('مقدار باید عدد صحیح و نامنفی باشد');
    if ((input.op === 'inc_pct' || input.op === 'dec_pct') && input.value > 1000) throw new BadRequestException('درصد معتبر نیست');
    const f = input.filter ?? {};
    const rows = (await this.matrix('customer', f.service)).filter((r) => {
      const o = r.options as unknown as Record<string, unknown>;
      return (!f.size || o.size === f.size) && (!f.colorType || o.colorType === f.colorType) && (!f.paper || o.paper === f.paper)
        && (!f.side || o.side === f.side) && (!f.comboKeys?.length || f.comboKeys.includes(r.comboKey));
    });
    const out: BulkPreview = { rows: [], skipped: [] };
    for (const r of rows) {
      const cur = r.current;
      if (!cur) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فعالی ندارد' }); continue; }
      if (cur.mode !== 'manual' || cur.price === undefined) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فرمولی است' }); continue; }
      const next = bulkValue(cur.price, input.op, input.value, input.rounding ?? 0);
      if (next === null) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'نتیجه منفی می‌شود' }); continue; }
      out.rows.push({ comboKey: r.comboKey, label: r.label, current: cur.price, next });
    }
    return out;
  }

  async bulkApply(input: BulkInput & { reason: string }, by: string) {
    const why = this.reason(input.reason);
    const preview = await this.bulkPreview(input);
    const bulkId = randomUUID();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    const docs: Awaited<ReturnType<PriceBookService['insertVersion']>>[] = [];
    const skipped = [...preview.skipped];
    const future = effectiveFrom.getTime() > Date.now();
    const applied: BulkPreview['rows'] = [];
    try {
      for (const row of preview.rows) {
        if (future && (await this.versions.exists({ layer: 'customer', providerId: null, comboKey: row.comboKey, state: 'published', effectiveFrom }))) {
          skipped.push({ comboKey: row.comboKey, label: row.label, reason: 'قیمت دیگری با همین زمان شروع منتشر شده است' });
          continue;
        }
        docs.push(await this.insertVersion({
          layer: 'customer', providerId: null, comboKey: row.comboKey, mode: 'manual', price: row.next,
          rounding: 0, effectiveFrom, state: 'published', reason: why, createdBy: new Types.ObjectId(by), bulkId,
        }));
        applied.push(row);
      }
    } finally {
      if (docs.length) {
        await this.catalog.invalidate();
        await this.audit('bulk', docs, why, by, { op: input.op, value: input.value, rounding: input.rounding ?? 0, filter: input.filter }, applied);
      }
    }
    return { bulkId, created: docs.length, skipped };
  }

  // ------------------------------------------------------------ spiral ranges

  async listRanges() {
    return this.ranges.find().sort({ minPages: 1 });
  }

  async createRange(body: { minPages: number; maxPages: number; on?: boolean }, by: string) {
    const all = await this.rangeLikes();
    const problem = rangeProblem({ ...body, on: body.on ?? true }, all);
    if (problem) throw new BadRequestException(problem);
    const doc = await this.ranges.create({ minPages: body.minPages, maxPages: body.maxPages, on: body.on ?? true, sort: all.length + 1 });
    await this.rangeAudit(doc, 'افزودن بازه', by);
    return doc;
  }

  async updateRange(id: string, patch: { minPages?: number; maxPages?: number; on?: boolean }, by: string) {
    const cur = await this.ranges.findById(this.oid(id));
    if (!cur) throw new NotFoundException('بازه یافت نشد');
    const next = { id, minPages: patch.minPages ?? cur.minPages, maxPages: patch.maxPages ?? cur.maxPages, on: patch.on ?? cur.on };
    const problem = rangeProblem(next, await this.rangeLikes());
    if (problem) throw new BadRequestException(problem);
    const doc = await this.ranges.findByIdAndUpdate(id, { $set: { minPages: next.minPages, maxPages: next.maxPages, on: next.on } }, { returnDocument: 'after' });
    await this.rangeAudit(doc!, 'ویرایش بازه', by);
    return doc;
  }

  async deleteRange(id: string, by: string) {
    if (await this.versions.exists({ comboKey: `spiral|${id}` })) throw new ConflictException('این بازه قیمت ثبت‌شده دارد؛ به‌جای حذف آن را غیرفعال کنید');
    const doc = await this.ranges.findByIdAndDelete(this.oid(id));
    if (!doc) throw new NotFoundException('بازه یافت نشد');
    await this.rangeAudit(doc, 'حذف بازه', by);
    return { ok: true };
  }

  // ------------------------------------------------------------ helpers

  /** Persian problem with a version's value fields, or null. */
  valueProblem(i: PreviewInput): string | null {
    if (i.mode !== 'manual' && i.mode !== 'formula') return 'این روش قیمت‌گذاری در مرحله بعد (قیمت مجریان) فعال می‌شود';
    if (i.rounding !== undefined && !(ROUNDINGS as readonly number[]).includes(i.rounding)) return 'گرد کردن معتبر نیست';
    if (i.mode === 'manual') {
      if (!Number.isInteger(i.price) || (i.price as number) < 0 || (i.price as number) > MAX_PRICE) return 'قیمت باید عدد صحیح و نامنفی (تومان) باشد';
      return null;
    }
    if (!i.formula?.trim()) return 'فرمول را بنویسید';
    const bad = validateFormula(i.formula, CUSTOMER_FORMULA_VARS);
    if (bad) return bad;
    for (const n of [i.markup, i.discount]) if (n !== undefined && (!Number.isInteger(n) || n < 0)) return 'مقادیر فرمول باید عدد صحیح و نامنفی باشند';
    return null;
  }

  private async insertVersion(fields: Omit<PriceVersion, 'version' | 'createdAt' | 'updatedAt'>) {
    for (let attempt = 0; ; attempt++) {
      const last = await this.versions.findOne({ layer: fields.layer, providerId: fields.providerId, comboKey: fields.comboKey }).sort({ version: -1 }).lean();
      try {
        return await this.versions.create({ ...fields, version: (last?.version ?? 0) + 1 });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt >= 4) throw err;
      }
    }
  }

  private async transition(id: string, from: PriceVersion['state'], to: PriceVersion['state'], action: PriceAuditAction, reason: string, by: string) {
    const why = this.reason(reason);
    const before = await this.findVersion(id);
    const now = new Date();
    const future = new Date(before.effectiveFrom).getTime() > now.getTime();
    if (to === 'published' && future && (await this.versions.exists({ _id: { $ne: before._id }, layer: before.layer, providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: before.effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: from },
      { $set: { state: to, updatedBy: new Types.ObjectId(by), ...(to === 'published' && !future ? { effectiveFrom: now } : {}) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException('وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید');
    await this.catalog.invalidate();
    await this.audit(to === 'published' && future ? 'schedule' : action, [doc], why, by, this.plain(before), this.plain(doc));
    return this.viewOne(doc);
  }

  private async findVersion(id: string) {
    const doc = await this.versions.findById(this.oid(id)).lean();
    if (!doc) throw new NotFoundException('نسخه قیمت یافت نشد');
    return doc as Row;
  }

  private reason(r: string) {
    const why = (r ?? '').trim();
    if (!why) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    return why.slice(0, 300);
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('شناسه معتبر نیست');
    return new Types.ObjectId(id);
  }

  private plain(d: unknown) {
    const o = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    return { version: o.version, mode: o.mode, price: o.price, formula: o.formula, rounding: o.rounding, effectiveFrom: o.effectiveFrom, effectiveUntil: o.effectiveUntil, state: o.state };
  }

  private async audit(action: PriceAuditAction, docs: { _id: unknown; comboKey: string; layer: string }[], reason: string, by: string, before?: unknown, after?: unknown) {
    await this.audits.create({
      action, layer: docs[0]?.layer ?? 'customer', providerId: null,
      comboKeys: [...new Set(docs.map((d) => d.comboKey))], versionIds: docs.map((d) => d._id as Types.ObjectId),
      reason, by: new Types.ObjectId(by), ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
    });
  }

  private async rangeAudit(doc: { _id: unknown; minPages: number; maxPages: number; on: boolean }, reason: string, by: string) {
    await this.catalog.invalidate();
    await this.audits.create({ action: 'range', layer: 'customer', providerId: null, comboKeys: [`spiral|${String(doc._id)}`], versionIds: [], reason, by: new Types.ObjectId(by), after: { minPages: doc.minPages, maxPages: doc.maxPages, on: doc.on } });
  }

  private async rangeLikes() {
    return (await this.ranges.find().lean()).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages, on: r.on }));
  }

  private names(papers: { key: string; name: string }[], ranges: { _id: unknown; minPages: number; maxPages: number }[]): LabelNames {
    return {
      papers: new Map(papers.map((p) => [p.key, p.name])),
      ranges: new Map(ranges.map((r) => [String(r._id), { minPages: r.minPages, maxPages: r.maxPages }])),
    };
  }

  private async namesOf(ids: Types.ObjectId[]) {
    const users = ids.length ? await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean() : [];
    return new Map(users.map((u) => [String(u._id), u.name]));
  }

  private async userNames(rows: Row[]) {
    return this.namesOf(rows.map((r) => r.createdBy).filter(Boolean) as Types.ObjectId[]);
  }

  /** Formula variables for a combo at quantity 1: `paper_cost` of its paper, `base_price` of its single sibling. */
  private async varsLoader(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date) {
    const likes = rows.map(toVersionLike);
    return (key: string): Record<string, number> => {
      const o = parseCombo(key);
      const vars: Record<string, number> = { quantity: 1 };
      if (o?.service === 'color') {
        const cost = papers.find((p) => p.key === o.paper)?.paperCost;
        if (typeof cost === 'number') vars.paper_cost = cost;
      }
      const sibling = singleSideKey(key);
      if (sibling) {
        const eff = pickEffective(likes.filter((v) => v.comboKey === sibling), at);
        const base = eff ? unitPrice(eff, { ...vars }) : null;
        if (base !== null) vars.base_price = base;
      }
      return vars;
    };
  }

  private view(r: Row, effectiveId: string | null, at: Date, users: Map<string, string>, vars: Record<string, number>): VersionView {
    const like = toVersionLike(r);
    return {
      id: String(r._id), layer: r.layer, providerId: r.providerId ? String(r.providerId) : null, comboKey: r.comboKey,
      version: r.version, mode: r.mode, rounding: r.rounding ?? 0,
      ...(r.price !== undefined ? { price: r.price } : {}), ...(r.formula ? { formula: r.formula } : {}),
      ...(r.markup !== undefined ? { markup: r.markup } : {}), ...(r.discount !== undefined ? { discount: r.discount } : {}),
      effectiveFrom: new Date(r.effectiveFrom).toISOString(),
      ...(r.effectiveUntil ? { effectiveUntil: new Date(r.effectiveUntil).toISOString() } : {}),
      state: r.state, status: displayStatus(like, effectiveId, at), reason: r.reason,
      ...(r.createdBy ? { createdBy: { id: String(r.createdBy), name: users.get(String(r.createdBy)) ?? '' } } : {}),
      createdAt: new Date(r.createdAt ?? r.effectiveFrom).toISOString(),
      unitPrice: unitPrice(like, vars),
    };
  }

  private async viewOne(doc: { _id: unknown; comboKey: string }): Promise<VersionView> {
    return (await this.history('customer', doc.comboKey)).find((v) => v.id === String(doc._id))!;
  }
}
