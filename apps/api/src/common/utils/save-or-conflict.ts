import { ConflictException } from '@nestjs/common';
import mongoose, { type Document } from 'mongoose';

/**
 * Save a document loaded earlier in the request. Schemas with `optimisticConcurrency` reject the save
 * when the document changed in between (atomic updates bump `__v`), so a stale save can never
 * silently undo e.g. a cancellation — the caller gets a 409 instead.
 */
export async function saveOrConflict<T extends Document>(doc: T): Promise<T> {
  try {
    return await doc.save();
  } catch (err) {
    if (err instanceof mongoose.Error.VersionError) {
      throw new ConflictException('سفارش هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
    }
    throw err;
  }
}
