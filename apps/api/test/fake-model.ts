/**
 * In-memory stand-in for the subset of a Mongoose Model the services use: Mongo-style filters
 * (dotted paths, $in/$nin/$ne/$exists/$lt/$lte/$gt/$gte/$elemMatch/$or) and updates
 * ($set/$unset/$inc/$push). Each update matches and applies without an await in between, so it is
 * atomic like a real findOneAndUpdate — concurrency tests can rely on it. Test-only helper.
 */
import { Types } from 'mongoose';

export type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const get = (doc: Doc, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v == null ? undefined : (v as Doc)[k]), doc);

const norm = (v: unknown) => (v instanceof Types.ObjectId ? String(v) : v instanceof Date ? v.getTime() : v);

function eq(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && !Array.isArray(b)) return a.some((x) => eq(x, b));
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  return String(norm(a)) === String(norm(b));
}

const isOperatorObject = (c: unknown): c is Doc =>
  !!c && typeof c === 'object' && !Array.isArray(c) && !(c instanceof Types.ObjectId) && !(c instanceof Date) &&
  Object.keys(c).some((k) => k.startsWith('$'));

function matchCond(v: unknown, cond: unknown): boolean {
  if (cond instanceof RegExp) return typeof v === 'string' && cond.test(v);
  if (!isOperatorObject(cond)) return eq(v, cond);
  return Object.entries(cond).every(([op, arg]) => {
    const n = norm(v) as number;
    const a = norm(arg) as number;
    switch (op) {
      case '$in': return (arg as unknown[]).some((x) => eq(v, x));
      case '$nin': return !(arg as unknown[]).some((x) => eq(v, x));
      case '$ne': return !eq(v, arg);
      case '$exists': return arg ? v !== undefined : v === undefined;
      case '$lt': return v != null && n < a;
      case '$lte': return v != null && n <= a;
      case '$gt': return v != null && n > a;
      case '$gte': return v != null && n >= a;
      case '$elemMatch': return Array.isArray(v) && v.some((el) => matches(el as Doc, arg as Doc));
      default: throw new Error(`fake-model: unsupported operator ${op}`);
    }
  });
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
    return matchCond(get(doc, k), cond);
  });
}

function setPath(doc: Doc, path: string, value: unknown) {
  const keys = path.split('.');
  let o = doc;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

function unsetPath(doc: Doc, path: string) {
  const keys = path.split('.');
  const parent = keys.length > 1 ? get(doc, keys.slice(0, -1).join('.')) : doc;
  if (parent && typeof parent === 'object') delete (parent as Doc)[keys[keys.length - 1]];
}

export function applyUpdate(doc: Doc, update: Doc) {
  for (const [k, v] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, k, v);
  for (const k of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, k);
  for (const [k, v] of Object.entries((update.$inc as Doc) ?? {})) setPath(doc, k, ((get(doc, k) as number) ?? 0) + (v as number));
  for (const [k, v] of Object.entries((update.$push as Doc) ?? {})) {
    const items = (v as { $each?: unknown[] })?.$each ?? [v];
    setPath(doc, k, [...((get(doc, k) as unknown[]) ?? []), ...items]);
  }
  for (const [k, v] of Object.entries((update.$addToSet as Doc) ?? {})) {
    const current = [...((get(doc, k) as unknown[]) ?? [])];
    for (const item of (v as { $each?: unknown[] })?.$each ?? [v]) if (!current.some((x) => eq(x, item))) current.push(item);
    setPath(doc, k, current);
  }
}

/** Deep copy of plain objects/arrays; ObjectIds, Dates and Buffers are kept as-is. */
export const clone = <T>(v: T): T =>
  (Array.isArray(v)
    ? v.map(clone)
    : v && typeof v === 'object' && (v as object).constructor === Object
      ? Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, clone(x)]))
      : v) as T;

const out = (d: Doc) => {
  const o = { ...clone(d), id: String(d._id) };
  // like a hydrated document's toJSON; non-enumerable, so equality assertions ignore it
  Object.defineProperty(o, 'toJSON', { value: () => ({ ...o }), enumerable: false });
  return o;
};

/** The plain equality fields of a filter (what an upsert inserts). */
const equalityFields = (filter: Doc): Doc =>
  Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith('$') && !isOperatorObject(v)));

/** A thenable query supporting the chain calls the services make. */
function query<T>(run: (skip: number, limit?: number) => T) {
  let skip = 0;
  let limit: number | undefined;
  const q = {
    sort: () => q,
    select: () => q,
    lean: () => q,
    skip: (n: number) => ((skip = n), q),
    limit: (n: number) => ((limit = n), q),
    // intentionally thenable: mimics a Mongoose Query, which services `await` directly
    // oxlint-disable-next-line unicorn/no-thenable
    then:<R1, R2>(res: (v: T) => R1, rej?: (e: unknown) => R2) => Promise.resolve().then(() => run(skip, limit)).then(res, rej),
  };
  return q;
}

export function fakeModel(docs: Doc[] = []) {
  const first = (filter: Doc) => docs.find((d) => matches(d, filter));
  const removeWhere = (filter: Doc, many: boolean) => {
    let deletedCount = 0;
    for (let i = docs.length - 1; i >= 0; i--) {
      if (matches(docs[i], filter) && (many || deletedCount === 0)) {
        docs.splice(i, 1);
        deletedCount++;
      }
    }
    return { deletedCount };
  };
  const updateOne = async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
    await Promise.resolve();
    let d = first(filter);
    if (!d && options?.upsert) {
      d = { _id: new Types.ObjectId(), ...clone(equalityFields(filter)) };
      docs.push(d);
      applyUpdate(d, update);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!d) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    applyUpdate(d, update);
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  };
  return {
    docs,
    find: vi.fn((filter: Doc = {}) =>
      query((skip, limit) => docs.filter((d) => matches(d, filter)).slice(skip, limit === undefined ? undefined : skip + limit).map(out)),
    ),
    findOne: vi.fn((filter: Doc = {}) => query(() => {
      const d = first(filter);
      return d ? out(d) : null;
    })),
    findById: vi.fn((id: unknown) => query(() => {
      const d = docs.find((x) => eq(x._id, id));
      return d ? out(d) : null;
    })),
    findByIdAndUpdate: vi.fn(async (id: unknown, update: Doc) => {
      await Promise.resolve();
      const d = docs.find((x) => eq(x._id, id));
      if (!d) return null;
      applyUpdate(d, update);
      return out(d);
    }),
    findByIdAndDelete: vi.fn(async (id: unknown) => {
      const i = docs.findIndex((x) => eq(x._id, id));
      return i < 0 ? null : out(docs.splice(i, 1)[0]);
    }),
    exists: vi.fn(async (filter: Doc) => (first(filter) ? { _id: first(filter)!._id } : null)),
    countDocuments: vi.fn(async (filter: Doc = {}) => docs.filter((d) => matches(d, filter)).length),
    distinct: vi.fn(async (field: string, filter: Doc = {}) => {
      // like Mongo, an array field contributes each of its elements
      const values = docs.filter((d) => matches(d, filter)).flatMap((d) => [get(d, field)].flat()).filter((v) => v !== undefined);
      return [...new Map(values.map((v) => [String(norm(v)), v])).values()];
    }),
    findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc) => {
      await Promise.resolve();
      const d = first(filter);
      if (!d) return null;
      applyUpdate(d, update);
      return out(d);
    }),
    updateOne: vi.fn(updateOne),
    updateMany: vi.fn(async (filter: Doc, update: Doc) => {
      await Promise.resolve();
      const hits = docs.filter((d) => matches(d, filter));
      hits.forEach((d) => applyUpdate(d, update));
      return { matchedCount: hits.length, modifiedCount: hits.length };
    }),
    /** `updateOne` operations only. */
    bulkWrite: vi.fn(async (ops: { updateOne?: { filter: Doc; update: Doc; upsert?: boolean } }[]) => {
      let modifiedCount = 0;
      for (const op of ops) if (op.updateOne) modifiedCount += (await updateOne(op.updateOne.filter, op.updateOne.update, op.updateOne)).modifiedCount;
      return { modifiedCount };
    }),
    deleteOne: vi.fn(async (filter: Doc) => removeWhere(filter, false)),
    deleteMany: vi.fn(async (filter: Doc = {}) => removeWhere(filter, true)),
    create: vi.fn(async (doc: Doc) => {
      const d = { _id: new Types.ObjectId(), createdAt: new Date(), ...clone(doc) };
      docs.push(d);
      return out(d);
    }),
  };
}

export type FakeModel = ReturnType<typeof fakeModel>;
