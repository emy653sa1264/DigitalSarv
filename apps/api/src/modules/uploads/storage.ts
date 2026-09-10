import { createReadStream, type ReadStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Where uploaded files live. Keys are generated server-side (`yyyy/mm/<id>.<ext>`). */
export interface StorageDriver {
  readonly name: string;
  /** Moves a finished temp file into storage under `key`. */
  putFile(tmpPath: string, key: string): Promise<void>;
  open(key: string): ReadStream;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

/** Local-disk driver rooted at `UPLOAD_DIR` (a Docker volume in production). */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  readonly root: string;

  constructor(root: string) {
    this.root = isAbsolute(root) ? root : resolve(process.cwd(), root);
  }

  /** Directory multer writes in-flight uploads to (same volume, so `rename` is atomic). */
  get tmpDir(): string {
    return resolve(this.root, '.tmp');
  }

  /** Absolute path of `key`; refuses anything that would escape the root. */
  resolveKey(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`storage key escapes the upload root: ${key}`);
    return full;
  }

  async putFile(tmpPath: string, key: string): Promise<void> {
    const dest = this.resolveKey(key);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await rename(tmpPath, dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      await copyFile(tmpPath, dest);
      await unlink(tmpPath);
    }
  }

  open(key: string): ReadStream {
    return createReadStream(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolveKey(key))).isFile();
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
