/**
 * PDF page counting off the main thread. An upload may be `UPLOAD_MAX_MB` and pdf-lib parses it
 * synchronously, so `countPdfPages` runs this same file as a `worker_threads` worker with a time and
 * memory budget; on timeout/failure the page count is unknown (the customer enters it manually).
 *
 * Self-contained on purpose (only pdf-lib and node builtins, no relative imports): the worker loads this
 * very file — `dist/modules/uploads/pdf-pages.js` when built, the `.ts` source (Node type stripping)
 * under vitest.
 */
import { readFile } from 'node:fs/promises';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { PDFDocument } from 'pdf-lib';

/** Worker wall-clock budget. */
export const PDF_COUNT_TIMEOUT_MS = 5_000;
/** The `/Type /Page` fallback only scans files up to this size — a larger unparsable file gets no count. */
export const PDF_FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

/** Page count of a PDF; falls back to counting `/Type /Page` objects (bounded) when pdf-lib cannot parse it. */
export async function pdfPageCount(buf: Uint8Array): Promise<number | undefined> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    const n = doc.getPageCount();
    if (n > 0) return n;
  } catch {
    /* fall through */
  }
  if (buf.byteLength > PDF_FALLBACK_MAX_BYTES) return undefined;
  const text = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('latin1');
  const n = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
  return n > 0 ? n : undefined;
}

interface PdfPagesJob {
  pdfPagesPath: string;
}

/**
 * Counts the pages of the PDF at `path` in a worker thread. Resolves `undefined` (never rejects) when
 * the file is not a countable PDF, the worker fails/runs out of memory, or `timeoutMs` passes.
 */
export function countPdfPages(path: string, timeoutMs = PDF_COUNT_TIMEOUT_MS): Promise<number | undefined> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      const job: PdfPagesJob = { pdfPagesPath: path };
      worker = new Worker(new URL(import.meta.url), { workerData: job, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    } catch {
      resolve(undefined);
      return;
    }
    let settled = false;
    const done = (pages: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(pages);
      void worker.terminate();
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    worker.once('message', (n: unknown) => done(typeof n === 'number' && n > 0 ? n : undefined));
    worker.once('error', () => done(undefined));
    worker.once('exit', () => done(undefined));
  });
}

// ---------------------------------------------------------------- worker entry
const job = workerData as PdfPagesJob | null | undefined;
if (!isMainThread && parentPort && typeof job?.pdfPagesPath === 'string') {
  const port = parentPort;
  readFile(job.pdfPagesPath)
    .then(pdfPageCount)
    .then(
      (pages) => port.postMessage(pages ?? null),
      () => port.postMessage(null),
    );
}
