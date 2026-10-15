/**
 * In-memory stand-in for the subset of a Mongoose Model the services use: Mongo-style filters
 * (dotted paths, $in/$nin/$ne/$exists/$lt/$lte/$gt/$gte/$elemMatch/$or) and updates
 * ($set/$unset/$inc/$push/$pull/$addToSet, $setOnInsert on upserts), aggregate stages $match/$sort/$limit/$lookup/$unwind/$addFields/$group
 * ($sum/$max/$min over expressions) and opt-in unique indexes (`fakeModel(docs, { unique })`, E11000 like Mongo). Each update matches and applies without an await in between, so it is
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
      case '$size': return Array.isArray(v) && v.length === (arg as number);
      case '$not': return !matchCond(v, arg);
      case '$elemMatch': return Array.isArray(v) && v.some((el) => (isOperatorObject(arg) && !('$or' in arg) && !('$and' in arg) ? matchCond(el, arg) : matches(el as Doc, arg as Doc)));
      default: throw new Error(`fake-model: unsupported operator ${op}`);
    }
  });
}

/** Minimal `$expr`: `{ $gt | $lt | $ne: ['$a', '$b'] }` over two field paths (missing sorts lowest, like BSON). */
function exprMatches(doc: Doc, expr: Doc): boolean {
  const [op, args] = Object.entries(expr)[0] as [string, string[]];
  const val = (a: string) => {
    const v = norm(get(doc, a.replace(/^\$/, ''))) as number | undefined | null;
    return v === undefined || v === null ? -Infinity : v;
  };
  const [x, y] = [val(args[0]), val(args[1])];
  if (op === '$gt') return x > y;
  if (op === '$lt') return x < y;
  if (op === '$ne') return x !== y;
  throw new Error(`fake-model: unsupported $expr operator ${op}`);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
    if (k === '$expr') return exprMatches(doc, cond as Doc);
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

const UPDATE_OPERATORS = ['$set', '$unset', '$inc', '$push', '$pull', '$addToSet', '$setOnInsert'];

/** Like Mongo: one path in two operators (or as parent and child, `a` vs `a.b`) is a conflict error, also with `$setOnInsert`. */
export function assertNoConflict(update: Doc) {
  const paths = UPDATE_OPERATORS.flatMap((op) => Object.keys((update[op] as Doc) ?? {}));
  const dup = paths.find((x, i) => paths.some((y, j) => i !== j && (x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`))));
  if (dup) throw Object.assign(new Error(`fake-model: Updating the path '${dup}' would create a conflict`), { code: 40 });
}

export function applyUpdate(doc: Doc, update: Doc) {
  for (const [k, v] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, k, v);
  for (const k of Object.keys((update.$unset as Doc) ?? {})) unsetPath(doc, k);
  for (const [k, v] of Object.entries((update.$inc as Doc) ?? {})) setPath(doc, k, ((get(doc, k) as number) ?? 0) + (v as number));
  for (const [k, v] of Object.entries((update.$push as Doc) ?? {})) {
    const items = (v as { $each?: unknown[] })?.$each ?? [v];
    setPath(doc, k, [...((get(doc, k) as unknown[]) ?? []), ...items]);
  }
  for (const [k, v] of Object.entries((update.$pull as Doc) ?? {})) setPath(doc, k, ((get(doc, k) as unknown[]) ?? []).filter((x) => !(isOperatorObject(v) && Array.isArray(v.$in) ? v.$in.some((y: unknown) => eq(x, y)) : eq(x, v))));
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
function query<T>(run: (skip: number, limit?: number, sort?: Doc) => T) {
  let skip = 0;
  let limit: number | undefined;
  let sortSpec: Doc | undefined;
  const q = {
    sort: (s?: Doc) => ((sortSpec = s), q),
    select: () => q,
    lean: () => q,
    skip: (n: number) => ((skip = n), q),
    limit: (n: number) => ((limit = n), q),
    // intentionally thenable: mimics a Mongoose Query, which services `await` directly
    // oxlint-disable-next-line unicorn/no-thenable
    then:<R1, R2>(res: (v: T) => R1, rej?: (e: unknown) => R2) => Promise.resolve().then(() => run(skip, limit, sortSpec)).then(res, rej),
  };
  return q;
}

/** Stable sort by a Mongo-style spec (`{ field: 1 | -1 }`); no spec keeps insertion order. */
function sorted(rows: Doc[], spec?: Doc): Doc[] {
  const keys = Object.entries(spec ?? {});
  if (!keys.length) return rows;
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = norm(get(a, k)) as number | string;
      const y = norm(get(b, k)) as number | string;
      if (x === y) continue;
      if (x == null) return -Number(dir);
      if (y == null) return Number(dir);
      return (x < y ? -1 : 1) * Number(dir);
    }
    return 0;
  });
}

/** Aggregation expressions: `$field` paths, literals, and $add/$subtract/$divide/$floor/$cond/$ifNull/$lt/$lte/$gt/$gte/$eq/$ne/$and/$or/$not (dates compare/subtract as milliseconds). */
function evalExpr(e: unknown, row: Doc): unknown {
  if (typeof e === 'string') return e.startsWith('$') ? get(row, e.slice(1)) : e;
  if (!e || typeof e !== 'object' || Array.isArray(e) || e instanceof Date || e instanceof Types.ObjectId) return e;
  const entries = Object.entries(e as Doc);
  if (!entries[0][0].startsWith('$')) return Object.fromEntries(entries.map(([k, v]) => [k, evalExpr(v, row)])); // object literal (e.g. a compound group _id)
  const [op, arg] = entries[0];
  // `$cond` also has an object form: { if, then, else }
  if (op === '$cond' && arg && typeof arg === 'object' && !Array.isArray(arg)) {
    const c = arg as Doc;
    return evalExpr(c.if, row) ? evalExpr(c.then, row) : evalExpr(c.else, row);
  }
  const args = (Array.isArray(arg) ? arg : [arg]).map((x) => evalExpr(x, row));
  const n = (i: number) => norm(args[i]) as number;
  switch (op) {
    case '$add': return args.reduce<number>((t, x) => t + (norm(x) as number), 0);
    case '$subtract': return n(0) - n(1);
    case '$divide': return n(0) / n(1);
    case '$floor': return Math.floor(n(0));
    case '$cond': return args[0] ? args[1] : args[2];
    case '$ifNull': return args[0] ?? args[1];
    case '$lt': return n(0) < n(1);
    case '$lte': return n(0) <= n(1);
    case '$gt': return n(0) > n(1);
    case '$gte': return n(0) >= n(1);
    case '$eq': return eq(args[0], args[1]);
    case '$ne': return !eq(args[0], args[1]);
    case '$and': return args.every(Boolean);
    case '$or': return args.some(Boolean);
    case '$not': return !args[0];
    default: throw new Error(`fake-model: unsupported expression ${op}`);
  }
}

/** `$group` with `_id` an expression (`'$field'`, null, or a compound object) and `$sum` / `$max` / `$min` accumulators over expressions. */
function groupStage(rows: Doc[], spec: Doc): Doc[] {
  const { _id: idSpec, ...acc } = spec;
  const groups = new Map<string, { id: unknown; rows: Doc[] }>();
  const keyOf = (v: unknown): string => (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Types.ObjectId) ? JSON.stringify(Object.entries(v as Doc).map(([k, x]) => [k, keyOf(x)])) : String(norm(v)));
  for (const r of rows) {
    const id = idSpec === undefined ? null : (evalExpr(idSpec, r) ?? null);
    const k = keyOf(id);
    if (!groups.has(k)) groups.set(k, { id, rows: [] });
    groups.get(k)!.rows.push(r);
  }
  return [...groups.values()].map(({ id, rows: rs }) => {
    const out: Doc = { _id: id };
    for (const [name, a] of Object.entries(acc as Record<string, Doc>)) {
      const [fn, expr] = Object.entries(a)[0];
      const val = (r: Doc) => evalExpr(expr, r);
      const present = () => rs.map(val).filter((v) => v != null);
      if (fn === '$sum') out[name] = rs.reduce((t, r) => t + (typeof val(r) === 'number' ? (val(r) as number) : 0), 0);
      else if (fn === '$max') out[name] = present().reduce<unknown>((m, v) => (m == null || (norm(v) as number) > (norm(m) as number) ? v : m), null);
      else if (fn === '$min') out[name] = present().reduce<unknown>((m, v) => (m == null || (norm(v) as number) < (norm(m) as number) ? v : m), null);
      else throw new Error(`fake-model: unsupported accumulator ${fn}`);
    }
    return out;
  });
}

/** Pipeline stages $match, $lookup (localField/foreignField), $sort, $limit over docs; `from` is resolved through `joins`. */
export function runPipeline(docs: Doc[], pipeline: Doc[], joins: Record<string, { docs: Doc[] }>): Doc[] {
  let rows: Doc[] = docs.map((d) => clone(d));
  for (const stage of pipeline) {
    const [op, arg] = Object.entries(stage)[0] as [string, any]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (op === '$match') rows = rows.filter((r) => matches(r, arg));
    else if (op === '$sort') rows = sorted(rows, arg);
    else if (op === '$limit') rows = rows.slice(0, arg);
    else if (op === '$lookup') {
      const other = joins[arg.from];
      if (!other) throw new Error(`fake-model: $lookup from "${arg.from}" is not in joins`);
      rows = rows.map((r) => ({ ...r, [arg.as]: other.docs.filter((o) => eq(get(o, arg.foreignField), get(r, arg.localField))).map((o) => clone(o)) }));
    } else if (op === '$group') rows = groupStage(rows, arg);
    else if (op === '$addFields' || op === '$set') rows = rows.map((r) => ({ ...r, ...Object.fromEntries(Object.entries(arg as Doc).map(([k, v]) => [k, evalExpr(v, r)])) }));
    else if (op === '$unwind') {
      // like Mongo: an array field becomes one row per element (a dotted path is set in place); a non-array, non-null
      // value is one row as is; missing, null or empty drops the row
      const path = String(typeof arg === 'string' ? arg : arg.path).slice(1);
      rows = rows.flatMap((r) => {
        const list = get(r, path);
        if (list == null || (Array.isArray(list) && !list.length)) return [];
        return (Array.isArray(list) ? list : [list]).map((el) => {
          const copy = clone(r);
          setPath(copy, path, clone(el));
          return copy;
        });
      });
    }
    else throw new Error(`fake-model: unsupported stage ${op}`);
  }
  return rows;
}

export interface FakeOptions {
  /** Unique indexes as field lists; a document missing a field is not indexed (like a partial index). */
  unique?: string[][];
}

export function fakeModel(docs: Doc[] = [], opts: FakeOptions = {}) {
  const joins: Record<string, { docs: Doc[] }> = {};
  const assertUnique = (d: Doc) => {
    const fields = (opts.unique ?? []).find((fs) => fs.every((f) => get(d, f) != null) && docs.some((x) => x !== d && fs.every((f) => eq(get(x, f), get(d, f)))));
    if (fields) throw Object.assign(new Error(`E11000 duplicate key error (${fields.join(', ')})`), { code: 11000, keyPattern: Object.fromEntries(fields.map((f) => [f, 1])) });
  };
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
  /** An upsert inserts the filter's equality fields + `$setOnInsert` + the rest of the update. */
  const insertFromUpsert = (filter: Doc, update: Doc) => {
    const now = new Date();
    const d: Doc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...clone(equalityFields(filter)) };
    applyUpdate(d, { ...update, $set: { ...((update.$setOnInsert as Doc) ?? {}), ...((update.$set as Doc) ?? {}) } });
    assertUnique(d);
    docs.push(d);
    return d;
  };
  const updateOne = async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
    assertNoConflict(update);
    await Promise.resolve();
    const d = first(filter);
    if (!d && options?.upsert) {
      insertFromUpsert(filter, update);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!d) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    applyUpdate(d, update);
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  };
  const create = async (doc: Doc) => {
    const now = new Date();
    const d = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...clone(doc) };
    assertUnique(d);
    docs.push(d);
    return out(d);
  };
  return {
    docs,
    /** Collections $lookup can read, by collection name. */
    joins,
    aggregate: vi.fn(async (pipeline: Doc[]) => runPipeline(docs, pipeline, joins)),
    find: vi.fn((filter: Doc = {}) =>
      query((skip, limit, sort) => sorted(docs.filter((d) => matches(d, filter)), sort).slice(skip, limit === undefined ? undefined : skip + limit).map(out)),
    ),
    findOne: vi.fn((filter: Doc = {}) => query((_s, _l, sort) => {
      const d = sorted(docs.filter((x) => matches(x, filter)), sort)[0];
      return d ? out(d) : null;
    })),
    findById: vi.fn((id: unknown) => query(() => {
      const d = docs.find((x) => eq(x._id, id));
      return d ? out(d) : null;
    })),
    findByIdAndUpdate: vi.fn(async (id: unknown, update: Doc) => {
      assertNoConflict(update);
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
    findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
      assertNoConflict(update);
      await Promise.resolve();
      const d = first(filter);
      if (!d && options?.upsert) return out(insertFromUpsert(filter, update));
      if (!d) return null;
      applyUpdate(d, update);
      return out(d);
    }),
    updateOne: vi.fn(updateOne),
    updateMany: vi.fn(async (filter: Doc, update: Doc) => {
      assertNoConflict(update);
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
    create: vi.fn(create),
    insertMany: vi.fn(async (list: Doc[]) => Promise.all(list.map(create))),
  };
}

export type FakeModel = ReturnType<typeof fakeModel>;
