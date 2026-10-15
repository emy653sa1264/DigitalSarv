import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { canViewProviderPrices, type Permission } from '../../common/permissions.js';
import { escapeRegex, type Paged } from '../../common/utils/pagination.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Extra } from '../catalog/schemas/extra.schema.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { User } from '../users/user.schema.js';
import { CART_TYPE_KEYS, COLOR_TYPES, comboKey, DOC_INKS, FLYER_INKS, FLYER_PAPERS, FLYER_SIZES, isProviderOnly, parseCombo, PRINT_ADDONS, PRINT_SIZES, REPAIR_DEVICE_KEYS, SIDES, doubleSideKey, singleSideKey, type ComboOptions, type ComboService } from './combo.js';
import { bulkValue, type BulkOp } from './bulk.js';
import { Center } from '../centers/center.schema.js';
import { comboWithinCapabilities, type Capability, type ProviderStatus } from '../centers/provider-model.js';
import { formulaVariables, parseFormula, validateFormula } from './formula.js';
import { comboLabel, type LabelNames } from './labels.js';
import { CUSTOMER_FORMULA_VARS, layerPermission, PRICE_LAYERS, PRICE_MODES, ROUNDINGS, type DisplayStatus, type PriceLayer, type PriceMode } from './price-book.constants.js';
import { rangeProblem } from './ranges.js';
import { displayStatus, margin, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import { BindingRange } from './schemas/binding-range.schema.js';
import { PriceAudit, type PriceAuditAction } from './schemas/price-audit.schema.js';
import { PriceVersion } from './schemas/price-version.schema.js';
import { effectiveProviderPrices, toVersionLike } from './snapshot.js';

export interface VersionValue {
  mode: PriceMode; price?: number; formula?: string; markup?: number; discount?: number; rounding?: number; baseProviderId?: string;
}
export interface CreateVersionInput extends VersionValue {
  layer: PriceLayer; providerId?: string; comboKey: string;
  effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string; confirmNegativeMargin?: boolean;
}
export type PreviewInput = VersionValue & { comboKey: string; layer?: PriceLayer };
export interface VersionView {
  id: string; layer: PriceLayer; providerId: string | null; comboKey: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number; baseProviderId?: string;
  effectiveFrom: string; effectiveUntil?: string; state: VersionLike['state']; status: DisplayStatus;
  reason: string; reviewNote?: string; reviewedAt?: string; createdBy?: { id: string; name: string }; createdAt: string; unitPrice: number | null;
}
export interface MatrixRow {
  comboKey: string; service: ComboService; options: ComboOptions; label: string;
  current: VersionView | null; next: VersionView | null; pending: VersionView | null; lastRejected: VersionView | null; hasVersions: boolean;
}

export interface MarginConflict { comboKey: string; providerId: string; providerName: string; providerPrice: number; customerPrice: number }
/** What an admin without `provider_price_view` gets: the combos in conflict, no provider names or prices (M2-R1). */
export type RedactedConflict = { comboKey: string };
export type MarginWarning = MarginConflict | RedactedConflict;

export interface SubmitInput { comboKey: string; price: number; effectiveFrom?: string; reason: string }
export interface ProviderPriceView {
  id: string; comboKey: string; version: number; price: number | null; effectiveFrom: string; effectiveUntil?: string;
  status: DisplayStatus; reason: string; reviewNote?: string; createdAt: string;
}
export interface ProviderPriceRow {
  comboKey: string; service: ComboService; options: ComboOptions; label: string; capable: boolean;
  current: ProviderPriceView | null; next: ProviderPriceView | null; pending: ProviderPriceView | null; lastRejected: ProviderPriceView | null;
}
export interface PendingItem { version: VersionView; providerName: string; label: string; currentProviderPrice: number | null; customerPrice: number | null }

const PENDING_EXISTS = 'برای این ترکیب یک قیمت در انتظار تأیید دارید';
const STALE = 'وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید';

/** M2-R1: provider names/prices in an audit `after.negativeMargin` are shown only to readers with `provider_price_view`. */
function redactAfter(after: unknown): unknown {
  const nm = (after as { negativeMargin?: { comboKey: string }[] } | null | undefined)?.negativeMargin;
  if (!Array.isArray(nm)) return after;
  return { ...(after as object), negativeMargin: nm.map((c) => ({ comboKey: c.comboKey })) };
}

/**
 * The provider's own view of a version — an explicit whitelist (no author, layer, markup or customer data; §26).
 * `reason` is only the caller's own note (P4): admin/rollback/bulk reasons are never shown, so it is '' for those.
 */
function providerView(v: VersionView | null, userId?: string): ProviderPriceView | null {
  if (!v) return null;
  return {
    id: v.id, comboKey: v.comboKey, version: v.version, price: v.unitPrice, effectiveFrom: v.effectiveFrom,
    ...(v.effectiveUntil ? { effectiveUntil: v.effectiveUntil } : {}), status: v.status,
    reason: userId && v.createdBy?.id === userId ? v.reason : '',
    ...(v.reviewNote && v.state === 'rejected' ? { reviewNote: v.reviewNote } : {}), createdAt: v.createdAt,
  };
}
export interface CompareRow {
  comboKey: string; label: string; service: ComboService; providerId: string; providerName: string; providerStatus: ProviderStatus;
  providerPrice: number | null; pendingPrice: number | null; customerPrice: number | null; customerMode: PriceMode | null;
  difference: number | null; marginPct: number | null; negative: boolean;
}

export interface BulkInput {
  layer: PriceLayer;
  providerId?: string;
  filter: { service?: ComboService; size?: string; colorType?: string; paper?: string; side?: string; comboKeys?: string[] };
  op: BulkOp; value: number; rounding?: number; effectiveFrom?: string;
}
export interface BulkPreview {
  rows: { comboKey: string; label: string; current: number; next: number; negativeMargin: boolean }[];
  skipped: { comboKey: string; label: string; reason: string }[];
}

type Row = PriceVersion & { _id: Types.ObjectId };
const MAX_PRICE = 1_000_000_000;
const PAST_GRACE_MS = 60_000;
const PAST_MSG = 'زمان اعمال نمی‌تواند در گذشته باشد';
const PROVIDER_ONLY_MSG = 'این ترکیب فقط قیمت مجری دارد';
const NEGATIVE_MSG = 'قیمت مشتری کمتر از قیمت مجری است';
const DENIED = 'به این بخش دسترسی ندارید';
type ProviderPrices = Record<string, Record<string, number>>;

@Injectable()
export class PriceBookService {
  constructor(
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    @InjectModel(PriceAudit.name) private readonly audits: Model<PriceAudit>,
    @InjectModel(BindingRange.name) private readonly ranges: Model<BindingRange>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly catalog: CatalogService,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @Optional() @InjectModel(Extra.name) private readonly extras?: Model<Extra>,
  ) {}

  /** Throws unless the admin holds `permission` (absent `User.permissions` = every permission). */
  async assertCan(userId: string, permission: Permission): Promise<void> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null;
    if (!user || user.role !== 'admin' || (user.permissions && !user.permissions.includes(permission))) {
      throw new ForbiddenException(DENIED);
    }
  }

  /** The layers whose prices the admin may view (403 when none). */
  async viewableLayers(userId: string): Promise<PriceLayer[]> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null;
    if (!user || user.role !== 'admin') throw new ForbiddenException(DENIED);
    const layers = PRICE_LAYERS.filter((l) => !user.permissions || user.permissions.includes(layerPermission(l, 'view')));
    if (!layers.length) throw new ForbiddenException(DENIED);
    return [...layers];
  }

  // ------------------------------------------------------------ reads

  async matrix(layer: PriceLayer, service?: ComboService, at = new Date(), providerId: string | null = null): Promise<MatrixRow[]> {
    const scope = this.scope(layer, providerId);
    const [papers, ranges, rows, extras] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find(scope).lean() as Promise<Row[]>,
      this.extraList(layer),
    ]);
    const names = this.names(papers, ranges, extras);
    const users = await this.userNames(rows);
    const vars = await this.varsLoader(rows, papers, at);
    const out: MatrixRow[] = [];
    for (const key of this.knownKeys(papers, ranges, rows, layer, extras)) {
      const options = parseCombo(key);
      if (!options || (service && options.service !== service)) continue;
      const list = rows.filter((r) => r.comboKey === key);
      const likes = list.map(toVersionLike);
      const eff = pickEffective(likes, at);
      const future = likes
        .filter((v) => v.state === 'published' && v.effectiveFrom.getTime() > at.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
      const byId = (id?: string) => list.find((x) => String(x._id) === id);
      const latest = (state: PriceVersion['state']) => list.filter((r) => r.state === state).sort((a, b) => b.version - a.version)[0];
      const view = (r?: Row) => (r ? this.view(r, eff?.id ?? null, at, users, vars(key, r.baseProviderId)) : null);
      const rejected = latest('rejected');
      const newest = Math.max(0, ...list.filter((r) => r.state !== 'rejected').map((r) => r.version));
      out.push({
        comboKey: key, service: options.service, options, label: comboLabel(options, names),
        current: view(byId(eff?.id)), next: view(byId(future?.id)), pending: view(latest('pending_approval')),
        lastRejected: rejected && rejected.version > newest ? view(rejected) : null,
        hasVersions: list.length > 0,
      });
    }
    return out;
  }

  async history(layer: PriceLayer, comboKey: string, at = new Date(), providerId: string | null = null): Promise<VersionView[]> {
    const sibling = singleSideKey(comboKey);
    // the single-sided sibling is loaded too, so a formula's `base_price` evaluates in the history view
    const all = (await this.versions.find({ ...this.scope(layer, providerId), comboKey: { $in: sibling ? [comboKey, sibling] : [comboKey] } }).lean()) as Row[];
    const rows = all.filter((r) => r.comboKey === comboKey);
    const eff = pickEffective(rows.map(toVersionLike), at);
    const users = await this.userNames(rows);
    const vars = await this.varsLoader(all, await this.papers.find().lean(), at);
    return rows.sort((a, b) => b.version - a.version).map((r) => this.view(r, eff?.id ?? null, at, users, vars(comboKey, r.baseProviderId)));
  }

  async preview(input: PreviewInput): Promise<{ unitPrice: number | null; error?: string }> {
    const layer = input.layer ?? 'customer';
    const combo = parseCombo(input.comboKey);
    if (layer === 'customer' && combo && isProviderOnly(combo.service)) return { unitPrice: null, error: PROVIDER_ONLY_MSG };
    const problem = this.valueProblem(input, layer);
    if (problem) return { unitPrice: null, error: problem };
    const at = new Date();
    const papers = await this.papers.find().lean();
    const rows = layer === 'customer' ? ((await this.versions.find({ layer: 'customer', providerId: null }).lean()) as Row[]) : [];
    const vars = (await this.varsLoader(rows, papers, at, !!input.baseProviderId))(input.comboKey, input.baseProviderId);
    const value = unitPrice(this.candidate(input, at), vars);
    if (value !== null) return { unitPrice: value };
    const noBase = !!input.baseProviderId && vars.provider_price === undefined;
    return { unitPrice: null, error: noBase ? 'مجری پایه برای این ترکیب قیمت فعال ندارد' : 'با مقادیر فعلی قابل محاسبه نیست (قیمت پایه یا هزینه کاغذ را بررسی کنید)' };
  }

  // ------------------------------------------------------------ writes

  async create(input: CreateVersionInput, by: string): Promise<VersionView> {
    const layer = input.layer;
    if (!(PRICE_LAYERS as readonly string[]).includes(layer)) throw new BadRequestException('لایه قیمت معتبر نیست');
    await this.assertCan(by, layerPermission(layer, 'edit'));
    if (input.publish) await this.assertCan(by, layerPermission(layer, 'publish'));
    const scope = this.scope(layer, input.providerId);
    if (scope.providerId) await this.assertProvider(scope.providerId);
    const combo = parseCombo(input.comboKey);
    if (!combo) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    if (layer === 'customer' && isProviderOnly(combo.service)) throw new BadRequestException(PROVIDER_ONLY_MSG);
    await this.assertExtraExists(combo);
    const problem = this.valueProblem(input, layer);
    if (problem) throw new BadRequestException(problem);
    const base = input.baseProviderId && input.mode !== 'manual' ? this.oid(input.baseProviderId) : null;
    if (base) await this.assertProvider(base);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const effectiveUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : undefined;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveUntil && Number.isNaN(effectiveUntil.getTime()))) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveUntil && effectiveUntil.getTime() <= effectiveFrom.getTime()) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    if (input.publish && input.effectiveFrom && effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    if (input.publish && input.effectiveFrom && (await this.versions.exists({ ...scope, comboKey: input.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const negative = input.publish ? await this.checkMargin(input.comboKey, effectiveFrom, layer, scope.providerId, input, !!input.confirmNegativeMargin, by) : [];
    const doc = await this.insertVersion({
      ...scope, comboKey: input.comboKey, mode: input.mode,
      ...(input.mode === 'manual' ? { price: input.price } : {}),
      ...(input.mode === 'formula' ? { formula: input.formula!.trim() } : {}),
      ...(input.markup !== undefined ? { markup: input.markup } : {}),
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      ...(base ? { baseProviderId: base } : {}),
      rounding: layer === 'provider' ? 0 : (input.rounding ?? 0), effectiveFrom, ...(effectiveUntil ? { effectiveUntil } : {}),
      state: input.publish ? 'published' : 'draft', reason, createdBy: new Types.ObjectId(by),
    });
    const action: PriceAuditAction = !input.publish ? 'create' : effectiveFrom.getTime() > Date.now() ? 'schedule' : 'publish';
    await this.audit(action, [doc], reason, by, undefined, this.withNegative(this.plain(doc), negative));
    // markup customer prices depend on provider prices, so every published write invalidates the catalog
    if (input.publish) await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  async publish(id: string, reason: string, by: string, confirmNegativeMargin = false): Promise<VersionView> {
    const before = await this.versionFor(id, by, 'publish');
    await this.assertCan(by, layerPermission(before.layer, 'publish'));
    return this.transition(before, 'draft', 'published', 'publish', reason, by, confirmNegativeMargin);
  }

  async disable(id: string, reason: string, by: string): Promise<VersionView> {
    const before = await this.versionFor(id, by, 'publish');
    await this.assertCan(by, layerPermission(before.layer, 'publish'));
    return this.transition(before, 'published', 'disabled', 'disable', reason, by);
  }

  async rollback(id: string, reason: string, by: string, confirmNegativeMargin = false): Promise<VersionView> {
    const src = await this.versionFor(id, by, 'rollback');
    await this.assertCan(by, layerPermission(src.layer, 'rollback'));
    const why = this.reason(reason);
    if (src.state !== 'published' && src.state !== 'disabled') throw new BadRequestException('فقط نسخه‌های منتشرشده قابل بازگردانی هستند');
    const negative = await this.checkMargin(src.comboKey, new Date(), src.layer, src.providerId, this.valueOf(src), confirmNegativeMargin, by);
    const doc = await this.insertVersion({
      layer: src.layer, providerId: src.providerId, comboKey: src.comboKey, mode: src.mode,
      ...(src.price !== undefined ? { price: src.price } : {}), ...(src.formula ? { formula: src.formula } : {}),
      ...(src.markup !== undefined ? { markup: src.markup } : {}), ...(src.discount !== undefined ? { discount: src.discount } : {}),
      ...(src.baseProviderId ? { baseProviderId: src.baseProviderId } : {}),
      rounding: src.rounding ?? 0, effectiveFrom: new Date(), state: 'published', reason: why,
      createdBy: new Types.ObjectId(by), rollbackOf: src._id,
    });
    await this.catalog.invalidate();
    await this.audit('rollback', [doc], why, by, this.plain(src), this.withNegative(this.plain(doc), negative));
    return this.viewOne(doc);
  }

  async auditLog(page = 1, limit = 20, layers: PriceLayer[] = [...PRICE_LAYERS], readerId?: string) {
    const canSeeProviders = readerId ? await this.canViewProviderPrices(readerId) : false;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = { layer: { $in: layers } };
    const [items, total] = await Promise.all([
      this.audits.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      this.audits.countDocuments(filter),
    ]);
    const names = await this.namesOf(items.map((a) => a.by).filter(Boolean) as Types.ObjectId[]);
    return {
      items: items.map((a) => ({
        id: String(a._id), action: a.action, layer: a.layer, providerId: a.providerId ? String(a.providerId) : null,
        comboKeys: a.comboKeys, reason: a.reason, at: new Date(a.at).toISOString(), before: a.before, after: canSeeProviders ? a.after : redactAfter(a.after),
        ...(a.by ? { by: { id: String(a.by), name: names.get(String(a.by)) ?? '' } } : {}),
      })),
      total, page, limit,
    };
  }

  // ------------------------------------------------------------ provider workflow

  /** A provider submits its own price → `pending_approval` (never effective until an admin approves it). */
  async submit(providerId: string, input: SubmitInput, userId: string): Promise<ProviderPriceView> {
    const scope = this.scope('provider', providerId);
    const combo = parseCombo(input.comboKey);
    if (!combo) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    await this.assertExtraExists(combo);
    const problem = this.valueProblem({ comboKey: input.comboKey, mode: 'manual', price: input.price }, 'provider');
    if (problem) throw new BadRequestException(problem);
    const reason = this.reason(input.reason);
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    if (await this.versions.exists({ ...scope, comboKey: input.comboKey, state: 'pending_approval' })) throw new ConflictException(PENDING_EXISTS);
    const doc = await this.insertVersion({
      ...scope, comboKey: input.comboKey, mode: 'manual', price: input.price, rounding: 0, effectiveFrom,
      state: 'pending_approval', reason, createdBy: new Types.ObjectId(userId),
    });
    await this.audit('submit', [doc], reason, userId, undefined, this.plain(doc));
    return providerView(await this.viewOne(doc), userId)!;
  }

  /** Admin approval: published at max(requested, now); a customer version is never created or changed. */
  async approve(id: string, reason: string, by: string, confirmNegativeMargin = false): Promise<VersionView> {
    await this.assertCan(by, 'provider_price_publish');
    const before = await this.findVersion(id);
    if (before.layer !== 'provider') throw new BadRequestException('فقط قیمت‌های مجری تأیید می‌شوند');
    const why = this.reason(reason);
    if (before.state !== 'pending_approval') throw new ConflictException(STALE);
    const now = new Date();
    const requested = new Date(before.effectiveFrom);
    let effectiveFrom = requested;
    if (requested.getTime() <= now.getTime()) {
      // like `transition`: strictly after the latest already-started published version, so the approval deterministically wins
      effectiveFrom = now;
      const latest = await this.versions
        .findOne({ layer: 'provider', providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: { $lte: now } })
        .sort({ effectiveFrom: -1 })
        .lean();
      if (latest && new Date(latest.effectiveFrom).getTime() >= now.getTime()) effectiveFrom = new Date(new Date(latest.effectiveFrom).getTime() + 1);
    }
    if (requested.getTime() > now.getTime() && (await this.versions.exists({ layer: 'provider', providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const negative = await this.checkMargin(before.comboKey, effectiveFrom, 'provider', before.providerId, this.valueOf(before), confirmNegativeMargin, by);
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: 'pending_approval' },
      { $set: { state: 'published', effectiveFrom, reviewNote: why, reviewedBy: new Types.ObjectId(by), reviewedAt: now, updatedBy: new Types.ObjectId(by) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException(STALE);
    await this.catalog.invalidate(); // customer markup versions over this provider follow it
    await this.audit('approve', [doc], why, by, this.plain(before), this.withNegative(this.plain(doc), negative));
    return this.viewOne(doc);
  }

  async reject(id: string, reason: string, by: string): Promise<VersionView> {
    await this.assertCan(by, 'provider_price_publish');
    const before = await this.findVersion(id);
    if (before.layer !== 'provider') throw new BadRequestException('فقط قیمت‌های مجری تأیید می‌شوند');
    const why = this.reason(reason);
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: 'pending_approval' },
      { $set: { state: 'rejected', reviewNote: why, reviewedBy: new Types.ObjectId(by), reviewedAt: new Date(), updatedBy: new Types.ObjectId(by) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException(STALE);
    await this.audit('reject', [doc], why, by, this.plain(before), this.plain(doc));
    return this.viewOne(doc);
  }

  /**
   * Pending submissions, newest first, with the provider's current price and the customer price beside them.
   * Batched (P13): one read of the page's combos (+ single-sided siblings) instead of a history per row.
   */
  async pendingList(page = 1, limit = 20, readerId?: string) {
    const seeCustomer = readerId ? await this.canView(readerId, 'customer_price_view') : false;
    const filter = { layer: 'provider' as const, state: 'pending_approval' as const };
    const skip = (Math.max(1, page) - 1) * limit;
    const at = new Date();
    const [rows, total, papers, ranges, extras] = await Promise.all([
      this.versions.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean() as Promise<Row[]>,
      this.versions.countDocuments(filter),
      this.papers.find().lean(),
      this.ranges.find().lean(),
      this.extraList('provider'),
    ]);
    if (!rows.length) return { items: [] as PendingItem[], total, page, limit };
    const keys = [...new Set(rows.flatMap((r) => [r.comboKey, singleSideKey(r.comboKey)].filter((k): k is string => !!k)))];
    const providerIds = [...new Set(rows.map((r) => String(r.providerId)))];
    const [live, centers] = await Promise.all([
      this.versions.find({ comboKey: { $in: keys }, state: { $in: ['published', 'disabled'] } }).lean() as Promise<Row[]>,
      this.centers.find({ _id: { $in: providerIds.map((id) => new Types.ObjectId(id)) } }, { name: 1 }).lean(),
    ]);
    const names = this.names(papers, ranges, extras);
    const users = await this.userNames(rows);
    const providerName = new Map(centers.map((c) => [String(c._id), c.name]));
    const providerPrices = effectiveProviderPrices(live, at);
    const customerRows = live.filter((r) => r.layer === 'customer');
    const vars = this.varsFor(customerRows, papers, at, providerPrices);
    const items: PendingItem[] = rows.map((r) => {
      const pid = String(r.providerId);
      const options = parseCombo(r.comboKey);
      const eff = pickEffective(customerRows.filter((v) => v.comboKey === r.comboKey).map(toVersionLike), at);
      return {
        version: this.view(r, null, at, users, {}),
        providerName: providerName.get(pid) ?? '',
        label: options ? comboLabel(options, names) : r.comboKey,
        currentProviderPrice: providerPrices[pid]?.[r.comboKey] ?? null,
        customerPrice: seeCustomer && eff ? unitPrice(eff, vars(r.comboKey, eff.baseProviderId)) : null,
      };
    });
    return { items, total, page, limit };
  }

  /** `/provider/prices` — the caller's own versions per known combination (no customer data, §26). */
  async providerPrices(providerId: string, service?: ComboService, userId?: string): Promise<ProviderPriceRow[]> {
    const [rows, center] = await Promise.all([
      this.matrix('provider', service, new Date(), providerId),
      this.centers.findById(this.oid(providerId), { capabilities: 1 }).lean(),
    ]);
    const caps = ((center as { capabilities?: Capability[] } | null)?.capabilities ?? []) as Capability[];
    return rows.map((r) => ({
      comboKey: r.comboKey, service: r.service, options: r.options, label: r.label, capable: comboWithinCapabilities(r.options, caps),
      current: providerView(r.current, userId), next: providerView(r.next, userId),
      pending: providerView(r.pending, userId), lastRejected: providerView(r.lastRejected, userId),
    }));
  }

  async providerHistory(providerId: string, comboKey: string, userId?: string): Promise<ProviderPriceView[]> {
    if (!parseCombo(comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    return (await this.history('provider', comboKey, new Date(), providerId)).map((v) => providerView(v, userId)!);
  }

  // ------------------------------------------------------------ bulk

  async bulkPreview(input: BulkInput): Promise<BulkPreview> {
    if (!(PRICE_LAYERS as readonly string[]).includes(input.layer)) throw new BadRequestException('در هر عملیات فقط یک لایه قیمت مجاز است');
    if (!Number.isInteger(input.value) || input.value < 0) throw new BadRequestException('مقدار باید عدد صحیح و نامنفی باشد');
    if ((input.op === 'inc_pct' || input.op === 'dec_pct') && input.value > 1000) throw new BadRequestException('درصد معتبر نیست');
    const providerId = this.scope(input.layer, input.providerId).providerId;
    if (providerId) await this.assertProvider(providerId);
    const providerKey = providerId ? String(providerId) : null;
    const f = input.filter ?? {};
    const rows = (await this.matrix(input.layer, f.service, new Date(), providerKey)).filter((r) => {
      const o = r.options as unknown as Record<string, unknown>;
      return (!f.size || o.size === f.size) && (!f.colorType || o.colorType === f.colorType) && (!f.paper || o.paper === f.paper)
        && (!f.side || o.side === f.side) && (!f.comboKeys?.length || f.comboKeys.includes(r.comboKey));
    });
    const when = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const m = await this.marginChecker(Number.isNaN(when.getTime()) ? new Date() : when, rows.map((r) => r.comboKey));
    const out: BulkPreview = { rows: [], skipped: [] };
    for (const r of rows) {
      const cur = r.current;
      if (!cur) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فعالی ندارد' }); continue; }
      if (cur.mode !== 'manual' || cur.price === undefined) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فرمولی یا وابسته به مجری است' }); continue; }
      const next = bulkValue(cur.price, input.op, input.value, input.layer === 'provider' ? 0 : (input.rounding ?? 0));
      if (next === null) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'نتیجه منفی می‌شود' }); continue; }
      out.rows.push({ comboKey: r.comboKey, label: r.label, current: cur.price, next, negativeMargin: m.conflicts(r.comboKey, input.layer, providerKey, next).length > 0 });
    }
    return out;
  }

  async bulkApply(input: BulkInput & { reason: string; confirmNegativeMargin?: boolean }, by: string) {
    await this.assertCan(by, layerPermission(input.layer, 'bulk_update'));
    await this.assertCan(by, layerPermission(input.layer, 'publish'));
    const why = this.reason(input.reason);
    const scope = this.scope(input.layer, input.providerId);
    if (scope.providerId) await this.assertProvider(scope.providerId);
    const preview = await this.bulkPreview(input);
    const bulkId = randomUUID();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    if (input.effectiveFrom && effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    const flagged = preview.rows.filter((r) => r.negativeMargin);
    let negative: MarginConflict[] = [];
    if (flagged.length) {
      const m = await this.marginChecker(effectiveFrom, flagged.map((r) => r.comboKey));
      negative = flagged.flatMap((r) => m.conflicts(r.comboKey, input.layer, scope.providerId ? String(scope.providerId) : null, r.next));
      if (!input.confirmNegativeMargin) {
        // M2-R1: provider names and prices only for admins who may view provider prices
        const shown: MarginWarning[] = (await this.canViewProviderPrices(by)) ? negative : negative.map((c) => ({ comboKey: c.comboKey }));
        throw new ConflictException({ statusCode: 409, code: 'NEGATIVE_MARGIN', message: NEGATIVE_MSG, conflicts: shown });
      }
    }
    const docs: Awaited<ReturnType<PriceBookService['insertVersion']>>[] = [];
    const skipped = [...preview.skipped];
    const future = effectiveFrom.getTime() > Date.now();
    const applied: BulkPreview['rows'] = [];
    try {
      for (const row of preview.rows) {
        if (future && (await this.versions.exists({ ...scope, comboKey: row.comboKey, state: 'published', effectiveFrom }))) {
          skipped.push({ comboKey: row.comboKey, label: row.label, reason: 'قیمت دیگری با همین زمان شروع منتشر شده است' });
          continue;
        }
        docs.push(await this.insertVersion({
          ...scope, comboKey: row.comboKey, mode: 'manual', price: row.next,
          rounding: 0, effectiveFrom, state: 'published', reason: why, createdBy: new Types.ObjectId(by), bulkId,
        }));
        applied.push(row);
      }
    } finally {
      if (docs.length) {
        await this.catalog.invalidate();
        const appliedKeys = new Set(applied.map((r) => r.comboKey));
        const appliedNegative = negative.filter((c) => appliedKeys.has(c.comboKey));
        await this.audit('bulk', docs, why, by, { op: input.op, value: input.value, rounding: input.rounding ?? 0, filter: input.filter }, appliedNegative.length ? { rows: applied, negativeMargin: appliedNegative } : applied);
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
  valueProblem(i: PreviewInput, layer: PriceLayer = 'customer'): string | null {
    if (!(PRICE_MODES as readonly string[]).includes(i.mode)) return 'روش قیمت‌گذاری معتبر نیست';
    if (layer === 'provider' && i.mode !== 'manual') return 'قیمت مجری فقط به‌صورت دستی ثبت می‌شود';
    if (i.rounding !== undefined && !(ROUNDINGS as readonly number[]).includes(i.rounding)) return 'گرد کردن معتبر نیست';
    if (i.mode === 'manual') {
      if (!Number.isInteger(i.price) || (i.price as number) < 0 || (i.price as number) > MAX_PRICE) return 'قیمت باید عدد صحیح و نامنفی (تومان) باشد';
      return null;
    }
    const baseOk = !!i.baseProviderId && Types.ObjectId.isValid(i.baseProviderId);
    if (i.mode === 'fixed_markup' || i.mode === 'percent_markup') {
      if (!baseOk) return 'مجری پایه را انتخاب کنید';
      const pct = i.mode === 'percent_markup';
      if (!Number.isInteger(i.markup) || (i.markup as number) < 0 || (i.markup as number) > (pct ? 1000 : MAX_PRICE)) {
        return pct ? 'درصد سود باید عدد صحیح بین ۰ تا ۱۰۰۰ باشد' : 'مبلغ سود باید عدد صحیح و نامنفی (تومان) باشد';
      }
      return null;
    }
    if (!i.formula?.trim()) return 'فرمول را بنویسید';
    const bad = validateFormula(i.formula, CUSTOMER_FORMULA_VARS);
    if (bad) return bad;
    if (formulaVariables(parseFormula(i.formula)).includes('provider_price') && !baseOk) return 'برای استفاده از provider_price مجری پایه را انتخاب کنید';
    for (const n of [i.markup, i.discount]) if (n !== undefined && (!Number.isInteger(n) || n < 0)) return 'مقادیر فرمول باید عدد صحیح و نامنفی باشند';
    return null;
  }

  /** `{ layer, providerId }` filter of one price list; the provider layer needs a valid provider id. */
  private scope(layer: PriceLayer, providerId?: string | null): { layer: PriceLayer; providerId: Types.ObjectId | null } {
    if (layer === 'customer') return { layer, providerId: null };
    if (!providerId || !Types.ObjectId.isValid(providerId)) throw new BadRequestException('مجری را انتخاب کنید');
    return { layer, providerId: new Types.ObjectId(providerId) };
  }

  /**
   * What-if margin checks at `at`, scoped to the checked combo (and its single-sided sibling, for `base_price`):
   * the unit of a candidate value, and the providers whose effective price would exceed the customer's effective
   * unit (quantity 1) if the candidate were in force. Never loads other combos' versions (P13).
   */
  private async marginChecker(at: Date, comboKeys: string[]) {
    const keys = [...new Set(comboKeys.flatMap((k) => { const sib = singleSideKey(k); return sib ? [k, sib] : [k]; }))];
    const [rows, papers, centers] = await Promise.all([
      this.versions.find({ comboKey: { $in: keys }, state: { $in: ['published', 'disabled'] } }).lean() as Promise<Row[]>,
      this.papers.find().lean(),
      this.centers.find({}, { name: 1 }).lean(),
    ]);
    const providerBase = effectiveProviderPrices(rows, at);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const customerLikes = customerRows.map(toVersionLike);
    const names = new Map(centers.map((c) => [String(c._id), c.name]));
    const unitOf = (v: VersionValue, key: string, layer: PriceLayer): number | null =>
      layer === 'provider'
        ? unitPrice(this.candidate(v, at), {})
        : unitPrice(this.candidate(v, at), this.varsFor(customerRows, papers, at, providerBase)(key, v.baseProviderId));
    const conflicts = (key: string, layer: PriceLayer, providerId: string | null, unit: number | null): MarginConflict[] => {
      if (unit === null) return [];
      const prices: ProviderPrices = layer === 'provider' && providerId ? { ...providerBase, [providerId]: { ...providerBase[providerId], [key]: unit } } : providerBase;
      let customer: number | null = unit;
      if (layer === 'provider') {
        // a customer markup over this provider follows the candidate price
        const eff = pickEffective(customerLikes.filter((v) => v.comboKey === key), at);
        customer = eff ? unitPrice(eff, this.varsFor(customerRows, papers, at, prices)(key, eff.baseProviderId)) : null;
      }
      if (customer === null) return [];
      const c = customer;
      return Object.entries(prices)
        // changing one provider's price must not report other providers' pre-existing conflicts
        .filter(([pid]) => layer !== 'provider' || !providerId || pid === providerId)
        .filter(([, m]) => typeof m[key] === 'number' && m[key] > c)
        .map(([pid, m]) => ({ comboKey: key, providerId: pid, providerName: names.get(pid) ?? '', providerPrice: m[key], customerPrice: c }));
    };
    return { unitOf, conflicts };
  }

  /** 409 NEGATIVE_MARGIN unless confirmed; returns the (confirmed) conflicts for the audit. */
  private async checkMargin(comboKey: string, at: Date, layer: PriceLayer, providerId: Types.ObjectId | null, value: VersionValue, confirmed: boolean, by: string): Promise<MarginConflict[]> {
    const m = await this.marginChecker(at, [comboKey]);
    const found = [
      ...m.conflicts(comboKey, layer, providerId ? String(providerId) : null, m.unitOf(value, comboKey, layer)),
      ...(layer === 'customer' ? await this.dependentConflicts(comboKey, at, value) : []),
    ];
    // M2-R1: provider names and prices only for admins who may view provider prices (the count stays visible)
    const shown: MarginWarning[] = found.length && !(await this.canViewProviderPrices(by)) ? found.map((c) => ({ comboKey: c.comboKey })) : found;
    if (found.length && !confirmed) throw new ConflictException({ statusCode: 409, code: 'NEGATIVE_MARGIN', message: NEGATIVE_MSG, conflicts: shown });
    return found; // the audit keeps the full list; it is redacted for the reader at read time (M2-R1)
  }

  /**
   * S10: a customer `…|single` price is the `base_price` of its `…|double` sibling. When that sibling's effective customer
   * version is derived (not manual), its unit is recomputed with the candidate in force and checked against provider prices.
   */
  private async dependentConflicts(comboKey: string, at: Date, value: VersionValue): Promise<MarginConflict[]> {
    const dep = doubleSideKey(comboKey);
    if (!dep) return [];
    const [rows, papers, centers] = await Promise.all([
      this.versions.find({ comboKey: { $in: [comboKey, dep] }, state: { $in: ['published', 'disabled'] } }).lean() as Promise<Row[]>,
      this.papers.find().lean(),
      this.centers.find({}, { name: 1 }).lean(),
    ]);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const eff = pickEffective(customerRows.filter((r) => r.comboKey === dep).map(toVersionLike), at);
    if (!eff || eff.mode === 'manual') return [];
    const candidate = {
      _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey, version: Number.MAX_SAFE_INTEGER, state: 'published', effectiveFrom: at,
      mode: value.mode, price: value.price, formula: value.formula, markup: value.markup, discount: value.discount, rounding: value.rounding ?? 0,
      ...(value.baseProviderId ? { baseProviderId: new Types.ObjectId(value.baseProviderId) } : {}),
    } as unknown as Row;
    const prices = effectiveProviderPrices(rows, at);
    const unit = unitPrice(eff, this.varsFor([...customerRows, candidate], papers, at, prices)(dep, eff.baseProviderId));
    if (unit === null) return [];
    const names = new Map(centers.map((c) => [String(c._id), c.name]));
    return Object.entries(prices)
      .filter(([, m]) => typeof m[dep] === 'number' && m[dep] > unit)
      .map(([pid, m]) => ({ comboKey: dep, providerId: pid, providerName: names.get(pid) ?? '', providerPrice: m[dep], customerPrice: unit }));
  }

  private canViewProviderPrices(userId: string): Promise<boolean> {
    return (async () => canViewProviderPrices(Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null))();
  }

  private async canView(userId: string, permission: Permission): Promise<boolean> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null;
    return !!user && user.role === 'admin' && (!user.permissions || user.permissions.includes(permission));
  }

  private withNegative(after: Record<string, unknown>, conflicts: MarginConflict[]) {
    return conflicts.length ? { ...after, negativeMargin: conflicts } : after;
  }

  /** §23 view, paged by provider (S8): every combo of `service` x the page's providers; reads only that service's versions (admin only). */
  async compare(service: ComboService, providerId?: string, at = new Date(), page = 1, limit = 20): Promise<Paged<CompareRow>> {
    const centerFilter = providerId ? { _id: this.oid(providerId) } : {};
    const [papers, ranges, rows, centers, total] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find({ comboKey: new RegExp(`^${escapeRegex(service)}\\|`) }).lean() as Promise<Row[]>,
      this.centers.find(centerFilter, { name: 1, status: 1 }).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.centers.countDocuments(centerFilter),
    ]);
    const names = this.names(papers, ranges);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const providerPrices = effectiveProviderPrices(rows.filter((r) => r.state === 'published' || r.state === 'disabled'), at);
    const vars = this.varsFor(customerRows, papers, at, providerPrices);
    const pending = new Map<string, Row>();
    for (const r of rows) {
      if (r.layer !== 'provider' || r.state !== 'pending_approval') continue;
      const k = `${String(r.providerId)}|${r.comboKey}`;
      if (!pending.has(k) || pending.get(k)!.version < r.version) pending.set(k, r);
    }
    const out: CompareRow[] = [];
    for (const key of this.knownKeys(papers, ranges, rows, 'customer')) {
      const options = parseCombo(key);
      if (!options || options.service !== service) continue;
      const eff = pickEffective(customerRows.filter((r) => r.comboKey === key).map(toVersionLike), at);
      const customerPrice = eff ? unitPrice(eff, vars(key, eff.baseProviderId)) : null;
      const label = comboLabel(options, names);
      for (const c of centers) {
        const pid = String(c._id);
        const providerPrice = providerPrices[pid]?.[key] ?? null;
        out.push({
          comboKey: key, label, service: options.service, providerId: pid, providerName: c.name, providerStatus: (c.status ?? 'active') as ProviderStatus,
          providerPrice, pendingPrice: pending.get(`${pid}|${key}`)?.price ?? null,
          customerPrice, customerMode: eff?.mode ?? null, ...margin(customerPrice, providerPrice),
        });
      }
    }
    return { items: out, total, page, limit };
  }

  private async assertProvider(id: Types.ObjectId) {
    if (!(await this.centers.exists({ _id: id }))) throw new NotFoundException('مجری یافت نشد');
  }

  /** Every known combination of the layer (+ any combo with versions). Provider-only combos exist on the provider layer only. */
  private knownKeys(papers: { key: string; colorPrint?: boolean }[], ranges: { _id: unknown }[], rows: { comboKey: string }[], layer: PriceLayer, extras: { key: string }[] = []): string[] {
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
    if (layer === 'provider') {
      keys.push('school|book', 'school|lined');
      for (const ink of DOC_INKS) for (const side of SIDES) keys.push(comboKey({ service: 'docs', ink, side }));
      keys.push('docs|hardcover');
      for (const size of FLYER_SIZES) for (const ink of FLYER_INKS) for (const paper of FLYER_PAPERS) for (const side of SIDES) keys.push(comboKey({ service: 'flyer', size, ink, paper, side }));
      keys.push('flyer|design');
      for (const cartType of CART_TYPE_KEYS) keys.push(comboKey({ service: 'cart', cartType }));
      for (const device of REPAIR_DEVICE_KEYS) keys.push(comboKey({ service: 'repair', device }));
      for (const x of extras) keys.push(comboKey({ service: 'extra', key: x.key }));
    }
    for (const r of rows) {
      const o = parseCombo(r.comboKey);
      if (!keys.includes(r.comboKey) && o && (layer === 'provider' || !isProviderOnly(o.service))) keys.push(r.comboKey);
    }
    return keys;
  }

  private async insertVersion(fields: Omit<PriceVersion, 'version' | 'createdAt' | 'updatedAt'>) {
    for (let attempt = 0; ; attempt++) {
      const last = await this.versions.findOne({ layer: fields.layer, providerId: fields.providerId, comboKey: fields.comboKey }).sort({ version: -1 }).lean();
      try {
        return await this.versions.create({ ...fields, version: (last?.version ?? 0) + 1 });
      } catch (err) {
        const e = err as { code?: number; keyPattern?: Record<string, unknown> };
        // a duplicate on another unique index (the one-pending-per-combo index) is a real conflict, not a version race
        if (e.code === 11000 && e.keyPattern && !('version' in e.keyPattern)) throw new ConflictException(PENDING_EXISTS);
        if (e.code !== 11000 || attempt >= 4) throw err;
      }
    }
  }

  private async transition(before: Row, from: PriceVersion['state'], to: PriceVersion['state'], action: PriceAuditAction, reason: string, by: string, confirmNegativeMargin = false) {
    const why = this.reason(reason);
    const now = new Date();
    const future = new Date(before.effectiveFrom).getTime() > now.getTime();
    if (to === 'published' && future && (await this.versions.exists({ _id: { $ne: before._id }, layer: before.layer, providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: before.effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    if (to === 'published' && before.effectiveUntil && new Date(before.effectiveUntil).getTime() <= now.getTime()) {
      throw new BadRequestException('این پیش‌نویس منقضی شده است');
    }
    // A past draft starts now, but strictly after the latest already-started published version, so it deterministically wins.
    let startsAt = now;
    if (to === 'published' && !future) {
      const latest = await this.versions
        .findOne({ _id: { $ne: before._id }, layer: before.layer, providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: { $lte: now } })
        .sort({ effectiveFrom: -1 })
        .lean();
      if (latest && new Date(latest.effectiveFrom).getTime() >= now.getTime()) {
        startsAt = new Date(new Date(latest.effectiveFrom).getTime() + 1);
      }
    }
    const negative = to === 'published'
      ? await this.checkMargin(before.comboKey, future ? new Date(before.effectiveFrom) : startsAt, before.layer, before.providerId, this.valueOf(before), confirmNegativeMargin, by)
      : [];
    // Disabling a version that has not started yet cancels it (zero-length window); an active one stops selling now.
    const cancel = to === 'disabled' && future;
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: from },
      { $set: { state: to, updatedBy: new Types.ObjectId(by), ...(to === 'published' && !future ? { effectiveFrom: startsAt } : {}), ...(cancel ? { effectiveUntil: before.effectiveFrom } : {}) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException('وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید');
    await this.catalog.invalidate();
    await this.audit(to === 'published' && future ? 'schedule' : action, [doc], why, by, this.plain(before), this.withNegative(this.plain(doc), negative));
    // rendered at the version's own start so a +1 ms start is already in force
    return this.viewOne(doc, startsAt);
  }

  /** S9: an unknown id answers 403 to an admin who may not do `action` on any layer (no id probing), else 404. */
  private async versionFor(id: string, by: string, action: 'publish' | 'rollback'): Promise<Row> {
    const doc = Types.ObjectId.isValid(id) ? ((await this.versions.findById(id).lean()) as Row | null) : null;
    if (doc) return doc;
    const allowed = await Promise.all(PRICE_LAYERS.map((l) => this.canView(by, layerPermission(l, action))));
    if (!allowed.some(Boolean)) throw new ForbiddenException(DENIED);
    throw new NotFoundException('نسخه قیمت یافت نشد');
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
    return {
      version: o.version, mode: o.mode, price: o.price, formula: o.formula, markup: o.markup, baseProviderId: o.baseProviderId,
      rounding: o.rounding, effectiveFrom: o.effectiveFrom, effectiveUntil: o.effectiveUntil, state: o.state,
    };
  }

  private async audit(action: PriceAuditAction, docs: { _id: unknown; comboKey: string; layer: string; providerId?: unknown }[], reason: string, by: string, before?: unknown, after?: unknown) {
    await this.audits.create({
      action, layer: docs[0]?.layer ?? 'customer', providerId: (docs[0]?.providerId ?? null) as Types.ObjectId | null,
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

  /** Catalog extras (`extra|<key>` provider combos) — only the provider layer has them. */
  private async extraList(layer: PriceLayer): Promise<{ key: string; label: string }[]> {
    if (layer !== 'provider' || !this.extras) return [];
    return (await this.extras.find({}, { key: 1, label: 1 }).sort({ sort: 1, _id: 1 }).lean()) as { key: string; label: string }[];
  }

  /** `extra|<key>` must name a catalog extra (the other new services are closed enumerations checked by `parseCombo`). */
  private async assertExtraExists(combo: ComboOptions): Promise<void> {
    if (combo.service !== 'extra' || !this.extras) return;
    if (!(await this.extras.exists({ key: combo.key }))) throw new BadRequestException('خدمت اضافی انتخاب‌شده یافت نشد');
  }

  private names(papers: { key: string; name: string }[], ranges: { _id: unknown; minPages: number; maxPages: number }[], extras: { key: string; label: string }[] = []): LabelNames {
    return {
      papers: new Map(papers.map((p) => [p.key, p.name])),
      ranges: new Map(ranges.map((r) => [String(r._id), { minPages: r.minPages, maxPages: r.maxPages }])),
      extras: new Map(extras.map((x) => [x.key, x.label])),
    };
  }

  private async namesOf(ids: Types.ObjectId[]) {
    const users = ids.length ? await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean() : [];
    return new Map(users.map((u) => [String(u._id), u.name]));
  }

  private async userNames(rows: Row[]) {
    return this.namesOf(rows.map((r) => r.createdBy).filter(Boolean) as Types.ObjectId[]);
  }

  /** Variables of a combo at quantity 1: `paper_cost`, `base_price` (single sibling) and `provider_price` (base provider). */
  private varsFor(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date, providerPrices: ProviderPrices) {
    const likes = rows.map(toVersionLike);
    const fn = (key: string, baseProviderId?: unknown): Record<string, number> => {
      const o = parseCombo(key);
      const vars: Record<string, number> = { quantity: 1 };
      if (o?.service === 'color') {
        const cost = papers.find((p) => p.key === o.paper)?.paperCost;
        if (typeof cost === 'number') vars.paper_cost = cost;
      }
      if (baseProviderId) {
        const p = providerPrices[String(baseProviderId)]?.[key];
        if (typeof p === 'number') vars.provider_price = p;
      }
      const sibling = singleSideKey(key);
      if (sibling) {
        const eff = pickEffective(likes.filter((v) => v.comboKey === sibling), at);
        const base = eff ? unitPrice(eff, fn(sibling, eff.baseProviderId)) : null;
        if (base !== null) vars.base_price = base;
      }
      return vars;
    };
    return fn;
  }

  /** `varsFor` with the effective provider prices loaded when any row (or the caller) needs a base provider. */
  private async varsLoader(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date, withProviders = false) {
    const needed = withProviders || rows.some((r) => r.baseProviderId);
    const providerPrices = needed ? effectiveProviderPrices((await this.versions.find({ layer: 'provider', state: { $in: ['published', 'disabled'] } }).lean()) as Row[], at) : {};
    return this.varsFor(rows, papers, at, providerPrices);
  }

  /** A version-like for evaluating values that are not stored (preview, what-if checks). */
  private candidate(v: VersionValue, at: Date): VersionLike {
    return {
      id: 'candidate', version: 0, state: 'published', effectiveFrom: at, mode: v.mode, price: v.price, formula: v.formula,
      markup: v.markup, discount: v.discount, rounding: v.rounding ?? 0, baseProviderId: v.baseProviderId ?? null,
    };
  }

  private valueOf(r: Row): VersionValue {
    return {
      mode: r.mode, price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
      ...(r.baseProviderId ? { baseProviderId: String(r.baseProviderId) } : {}),
    };
  }

  private view(r: Row, effectiveId: string | null, at: Date, users: Map<string, string>, vars: Record<string, number>): VersionView {
    const like = toVersionLike(r);
    return {
      id: String(r._id), layer: r.layer, providerId: r.providerId ? String(r.providerId) : null, comboKey: r.comboKey,
      version: r.version, mode: r.mode, rounding: r.rounding ?? 0,
      ...(r.price !== undefined ? { price: r.price } : {}), ...(r.formula ? { formula: r.formula } : {}),
      ...(r.markup !== undefined ? { markup: r.markup } : {}), ...(r.discount !== undefined ? { discount: r.discount } : {}),
      ...(r.baseProviderId ? { baseProviderId: String(r.baseProviderId) } : {}),
      effectiveFrom: new Date(r.effectiveFrom).toISOString(),
      ...(r.effectiveUntil ? { effectiveUntil: new Date(r.effectiveUntil).toISOString() } : {}),
      state: r.state, status: displayStatus(like, effectiveId, at), reason: r.reason,
      ...(r.reviewNote ? { reviewNote: r.reviewNote } : {}), ...(r.reviewedAt ? { reviewedAt: new Date(r.reviewedAt).toISOString() } : {}),
      ...(r.createdBy ? { createdBy: { id: String(r.createdBy), name: users.get(String(r.createdBy)) ?? '' } } : {}),
      createdAt: new Date(r.createdAt ?? r.effectiveFrom).toISOString(),
      unitPrice: unitPrice(like, vars),
    };
  }

  private async viewOne(doc: { _id: unknown; comboKey: string; layer: PriceLayer; providerId?: unknown }, at = new Date()): Promise<VersionView> {
    return (await this.history(doc.layer, doc.comboKey, at, doc.providerId ? String(doc.providerId) : null)).find((v) => v.id === String(doc._id))!;
  }
}
