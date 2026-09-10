import { ConflictException } from '@nestjs/common';
import mongoose, { type Document } from 'mongoose';
import { saveOrConflict } from './save-or-conflict.js';

const docThatThrows = (err: unknown) => ({ save: vi.fn().mockRejectedValue(err) }) as unknown as Document;

describe('saveOrConflict', () => {
  it('returns the saved document', async () => {
    const doc = { save: vi.fn() } as unknown as Document;
    (doc.save as ReturnType<typeof vi.fn>).mockResolvedValue(doc);
    await expect(saveOrConflict(doc)).resolves.toBe(doc);
  });

  it('maps a stale-version save to 409', async () => {
    // what mongoose throws when optimisticConcurrency detects a changed document
    const stale = Object.create(mongoose.Error.VersionError.prototype) as Error;
    await expect(saveOrConflict(docThatThrows(stale))).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows other errors untouched', async () => {
    const boom = new Error('boom');
    await expect(saveOrConflict(docThatThrows(boom))).rejects.toBe(boom);
  });
});
