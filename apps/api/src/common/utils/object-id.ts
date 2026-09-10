import { NotFoundException } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/** Throws a Persian 404 when `id` is not a valid ObjectId (so bad ids never reach Mongo as CastErrors). */
export function assertObjectId(id: string, what = 'مورد'): string {
  if (!isValidObjectId(id)) throw new NotFoundException(`${what} یافت نشد`);
  return id;
}
