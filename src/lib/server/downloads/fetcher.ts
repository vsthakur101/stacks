import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { USER_AGENT } from '../http';
import { httpFetch } from '../net';

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`Server responded ${status}`);
    this.name = 'HttpStatusError';
  }
  get retryable(): boolean {
    return this.status === 429 || this.status === 408 || this.status >= 500;
  }
}

export class StallError extends Error {
  constructor() {
    super('Download stalled');
    this.name = 'StallError';
  }
}

export interface DownloadOptions {
  url: string;
  partPath: string;
  expectedSize: number | null;
  signal: AbortSignal;
  onProgress: (bytesDone: number, bytesTotal: number | null) => void;
  stallMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Streams `url` into `partPath`, resuming from the existing part size with a Range request.
 * Resolves when the server has sent the whole body; size/md5 verification is the caller's job.
 */
export async function downloadToFile(opts: DownloadOptions): Promise<void> {
  const { url, partPath, expectedSize, signal, onProgress } = opts;
  const stallMs = opts.stallMs ?? 60_000;
  const doFetch = opts.fetchImpl ?? (httpFetch as unknown as typeof fetch);

  let offset = await fileSizeOrZero(partPath);
  if (expectedSize !== null && offset > expectedSize) {
    await fsp.truncate(partPath, 0);
    offset = 0;
  }
  if (expectedSize !== null && offset === expectedSize && offset > 0) {
    onProgress(offset, expectedSize);
    return;
  }

  const stall = new AbortController();
  const combined = AbortSignal.any([signal, stall.signal]);
  let stallTimer: NodeJS.Timeout | undefined;
  const armStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => stall.abort(new StallError()), stallMs);
  };

  try {
    armStall();
    const res = await doFetch(url, {
      headers: { 'User-Agent': USER_AGENT, ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}) },
      redirect: 'follow',
      signal: combined,
    });

    if (res.status === 416) {
      // Our partial no longer matches the remote file; start over.
      await fsp.truncate(partPath, 0).catch(() => undefined);
      throw new HttpStatusError(503);
    }
    if (!res.ok || !res.body) throw new HttpStatusError(res.status, parseRetryAfter(res.headers.get('retry-after')));

    const resumed = res.status === 206 && offset > 0;
    if (!resumed) offset = 0;
    const lengthHeader = Number(res.headers.get('content-length'));
    const total = expectedSize ?? (Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader + offset : null);

    const out = fs.createWriteStream(partPath, { flags: resumed ? 'a' : 'w' });
    const outError = once(out, 'error').then(([e]) => Promise.reject(e as Error));
    outError.catch(() => undefined);
    let done = offset;
    onProgress(done, total);

    try {
      const reader = res.body.getReader();
      for (;;) {
        const { value, done: finished } = await Promise.race([reader.read(), outError]);
        if (finished) break;
        armStall();
        done += value.byteLength;
        if (!out.write(value)) await Promise.race([once(out, 'drain'), outError]);
        onProgress(done, total);
      }
    } finally {
      out.end();
      await Promise.race([once(out, 'finish'), outError]).catch(() => undefined);
    }
    if (combined.aborted) throw combined.reason instanceof Error ? combined.reason : new Error('Aborted');
  } catch (error) {
    if (stall.signal.aborted && !signal.aborted) throw new StallError();
    throw error;
  } finally {
    clearTimeout(stallTimer);
  }
}

export async function md5OfFile(file: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function fileSizeOrZero(file: string): Promise<number> {
  try {
    return (await fsp.stat(file)).size;
  } catch {
    return 0;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5 * 60_000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), 5 * 60_000)) : undefined;
}
