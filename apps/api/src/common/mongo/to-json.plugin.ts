import type { Schema } from 'mongoose';

/**
 * Serializes `_id` as `id: string` and drops `_id` / `__v` (applied globally to every schema).
 * Top-level paths declared `select: false` (internal bookkeeping) are never serialized either, even
 * on a document that was loaded or created with them.
 */
export function toJSONPlugin(schema: Schema): void {
  const hidden = Object.entries(schema.paths)
    .filter(([path, type]) => !path.includes('.') && (type.options as { select?: unknown })?.select === false)
    .map(([path]) => path);
  const transform = (_doc: unknown, ret: Record<string, unknown>) => {
    if (ret._id !== undefined && ret._id !== null) ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    for (const path of hidden) delete ret[path];
    return ret;
  };
  schema.set('toJSON', { virtuals: false, versionKey: false, transform });
  schema.set('toObject', { virtuals: false, versionKey: false, transform });
}
