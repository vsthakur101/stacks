import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  FORMAT_LABELS,
  TERMINAL_STATES,
  type DownloadEvent,
  type Fallback,
  type FriendlyFormat,
  type JobView,
  type QueueStatus,
  type TaskState,
  type TaskView,
  type TrayItem,
} from '@/lib/shared/types';
import { getItem as defaultGetItem, ItemNotFoundError, type ItemMetadata } from '../catalog/archive';
import { SECTIONS } from '../catalog/sections';
import type { Db } from '../db/client';
import { downloadJobs, downloadTasks } from '../db/schema';
import { downloadToFile, fileSizeOrZero, HttpStatusError, md5OfFile, StallError } from './fetcher';
import { fileSize, resolveFiles } from './formats';
import { absoluteDestination, relativeDestination } from './paths';
import { invalidateLibraryScan } from '../library/scan';

type TaskRow = typeof downloadTasks.$inferSelect;

export const MAX_ATTEMPTS = 5;
const PERSIST_EVERY_MS = 2_000;

export interface ManagerDeps {
  db: Db;
  getItem?: (identifier: string) => Promise<ItemMetadata>;
  fetchImpl?: typeof fetch;
  root: () => string;
  concurrency: () => number;
  /** Backoff before retry `attempt` (1-based). Overridable for tests. */
  backoffMs?: (attempt: number, retryAfterMs?: number) => number;
  fileUrl?: (identifier: string, fileName: string) => string;
  stallMs?: number;
  /** Download window: whether downloads may run now, and how to say when they will. */
  window?: () => { open: boolean; text: string } | null;
  throttle?: (bytes: number) => Promise<void>;
}

class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

export function defaultBackoff(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  return base / 2 + Math.random() * (base / 2);
}

export class DownloadManager extends EventEmitter {
  private readonly db: Db;
  private readonly deps: Required<Omit<ManagerDeps, 'db' | 'fetchImpl'>> & Pick<ManagerDeps, 'fetchImpl'>;
  private readonly running = new Map<string, AbortController>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly live = new Map<string, { bytesDone: number; persistedAt: number }>();
  private paused = false;
  /** Tasks stopped because the download window closed: they go back to the queue, not to cancelled. */
  private readonly windowStops = new Set<string>();
  private windowTimer: NodeJS.Timeout | undefined;
  private pauseReason: string | null = null;
  private scheduling = false;

  constructor(deps: ManagerDeps) {
    super();
    this.setMaxListeners(100);
    this.db = deps.db;
    this.deps = {
      getItem: deps.getItem ?? defaultGetItem,
      fetchImpl: deps.fetchImpl,
      root: deps.root,
      concurrency: deps.concurrency,
      backoffMs: deps.backoffMs ?? defaultBackoff,
      fileUrl:
        deps.fileUrl ??
        ((id, name) =>
          `https://archive.org/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`),
      stallMs: deps.stallMs ?? 60_000,
      window: deps.window ?? (() => null),
      throttle: deps.throttle ?? (async () => undefined),
    };
  }

  /** Re-queues work interrupted by a restart and starts the scheduler. */
  init(): void {
    this.db
      .update(downloadTasks)
      .set({ state: 'queued', updatedAt: Date.now() })
      .where(inArray(downloadTasks.state, ['resolving', 'downloading', 'verifying']))
      .run();
    this.schedule();
    // The window opens and closes on the clock: check every 30 s.
    this.windowTimer ??= setInterval(() => this.checkWindow(), 30_000);
    this.windowTimer.unref?.();
  }

  /** Stops running downloads when the window closes (partials kept for resuming); starts them when it opens. */
  checkWindow(): void {
    const w = this.deps.window();
    if (w && !w.open) {
      for (const [id, controller] of this.running) {
        this.windowStops.add(id);
        controller.abort();
      }
    }
    this.emitEvent({ type: 'queue', queue: this.queueStatus() });
    this.schedule();
  }

  /* ------------------------------ commands ------------------------------ */

  createJob(items: TrayItem[], format: FriendlyFormat, fallback: Fallback): string {
    const jobId = randomUUID();
    const now = Date.now();
    const unique = [...new Map(items.map((i) => [i.identifier, i])).values()];
    this.db.transaction((tx) => {
      tx.insert(downloadJobs).values({ id: jobId, createdAt: now, format, fallback, itemCount: unique.length }).run();
      unique.forEach((item, i) => {
        tx.insert(downloadTasks)
          .values({
            id: randomUUID(),
            jobId,
            seq: i * 1000,
            identifier: item.identifier,
            itemJson: JSON.stringify(item),
            state: 'queued',
            updatedAt: now,
          })
          .run();
      });
    });
    const job = this.getJob(jobId);
    if (job) this.emitEvent({ type: 'job', job });
    this.schedule();
    return jobId;
  }

  cancelJob(jobId: string): void {
    const tasks = this.db.select().from(downloadTasks).where(eq(downloadTasks.jobId, jobId)).all();
    for (const t of tasks) {
      if (TERMINAL_STATES.includes(t.state as TaskState)) continue;
      this.update(t.id, { state: 'cancelled', note: null });
      this.running.get(t.id)?.abort(new CancelledError());
    }
  }

  retryJob(jobId: string): void {
    const tasks = this.db
      .select()
      .from(downloadTasks)
      .where(and(eq(downloadTasks.jobId, jobId), inArray(downloadTasks.state, ['failed', 'cancelled'])))
      .all();
    for (const t of tasks) this.update(t.id, { state: 'queued', note: null, attempts: 0 });
    this.schedule();
  }

  /** Removes jobs whose tasks are all finished. Files on disk are untouched. */
  clearFinished(): void {
    for (const job of this.listJobs()) {
      if (job.tasks.every((t) => TERMINAL_STATES.includes(t.state))) {
        this.db.delete(downloadJobs).where(eq(downloadJobs.id, job.id)).run();
      }
    }
    this.emitEvent({ type: 'snapshot', jobs: this.listJobs(), queue: this.queueStatus() });
  }

  resume(): void {
    this.paused = false;
    this.pauseReason = null;
    this.emitEvent({ type: 'queue', queue: this.queueStatus() });
    this.schedule();
  }

  /* ------------------------------ queries ------------------------------ */

  queueStatus(): QueueStatus {
    const w = this.deps.window();
    return { paused: this.paused, pauseReason: this.pauseReason, waiting: w && !w.open ? w.text : null };
  }

  listJobs(limit = 50): JobView[] {
    const jobs = this.db.select().from(downloadJobs).orderBy(desc(downloadJobs.createdAt)).limit(limit).all();
    if (jobs.length === 0) return [];
    const tasks = this.db
      .select()
      .from(downloadTasks)
      .where(inArray(downloadTasks.jobId, jobs.map((j) => j.id)))
      .orderBy(asc(downloadTasks.seq))
      .all();
    return jobs.map((j) => ({
      id: j.id,
      createdAt: j.createdAt,
      format: j.format as FriendlyFormat,
      fallback: j.fallback as Fallback,
      tasks: tasks.filter((t) => t.jobId === j.id).map((t) => this.view(t)),
    }));
  }

  getJob(jobId: string): JobView | undefined {
    return this.listJobs(200).find((j) => j.id === jobId);
  }

  getTask(taskId: string): TaskView | undefined {
    const row = this.db.select().from(downloadTasks).where(eq(downloadTasks.id, taskId)).get();
    return row ? this.view(row) : undefined;
  }

  /** Resolves when nothing is queued or running. Test helper. */
  async idle(): Promise<void> {
    while (this.running.size > 0 || this.nextQueued() || this.scheduling) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /* ------------------------------ scheduler ------------------------------ */

  private schedule(): void {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      const w = this.deps.window();
      while (!this.paused && !(w && !w.open) && this.running.size < this.deps.concurrency()) {
        const next = this.nextQueued();
        if (!next) break;
        const controller = new AbortController();
        this.running.set(next.id, controller);
        void this.run(next, controller.signal).finally(() => {
          this.running.delete(next.id);
          this.live.delete(next.id);
          this.schedule();
        });
      }
    } finally {
      this.scheduling = false;
    }
  }

  private nextQueued(): TaskRow | undefined {
    const queued = this.db
      .select({ task: downloadTasks })
      .from(downloadTasks)
      .innerJoin(downloadJobs, eq(downloadJobs.id, downloadTasks.jobId))
      .where(eq(downloadTasks.state, 'queued'))
      .orderBy(asc(downloadJobs.createdAt), asc(downloadTasks.seq))
      .limit(this.running.size + 1)
      .all();
    return queued.map((r) => r.task).find((t) => !this.running.has(t.id));
  }

  /* ------------------------------ task lifecycle ------------------------------ */

  private async run(initial: TaskRow, signal: AbortSignal): Promise<void> {
    let task = initial;
    try {
      if (!task.fileName) {
        const resolved = await this.resolve(task, signal);
        if (!resolved) return;
        task = resolved;
      }
      await this.download(task, signal);
    } catch (error) {
      if (this.windowStops.delete(task.id)) {
        this.update(task.id, { state: 'queued', note: 'Waiting for the download window' });
        return;
      }
      if (error instanceof CancelledError || signal.aborted) {
        this.update(task.id, { state: 'cancelled' });
        return;
      }
      if (isDiskFull(error)) {
        this.paused = true;
        this.pauseReason = 'The disk is full. Free some space, then resume.';
        this.update(task.id, { state: 'queued', note: 'Waiting for disk space' });
        this.emitEvent({ type: 'queue', queue: this.queueStatus() });
        return;
      }
      this.update(task.id, { state: 'failed', note: describeError(error) });
    }
  }

  /** Metadata → files for the chosen format. Returns the updated row, or null if the task ended here. */
  private async resolve(task: TaskRow, signal: AbortSignal): Promise<TaskRow | null> {
    this.update(task.id, { state: 'resolving' });
    const job = this.db.select().from(downloadJobs).where(eq(downloadJobs.id, task.jobId)).get();
    if (!job) throw new CancelledError();
    const item = JSON.parse(task.itemJson) as TrayItem;

    let meta: ItemMetadata;
    try {
      meta = await this.withRetries(task, signal, () => this.deps.getItem(task.identifier));
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        this.update(task.id, { state: 'skipped', note: 'Not found on archive.org' });
        return null;
      }
      throw error;
    }
    if (meta.restricted) {
      this.update(task.id, { state: 'skipped', note: 'Borrow-only — not downloadable' });
      return null;
    }

    const chosen = resolveFiles(meta.files, job.format as FriendlyFormat, job.fallback as Fallback);
    if (!chosen) {
      this.update(task.id, { state: 'skipped', note: `No ${FORMAT_LABELS[job.format as FriendlyFormat]} available` });
      return null;
    }

    const fullItem: TrayItem = {
      ...item,
      year: item.year ?? meta.year,
      date: item.date ?? meta.date,
    };
    const publicationFallback =
      meta.publisher ?? meta.collections.find((c) => !SECTIONS[item.section].roots.includes(c));
    const multiFile = chosen.files.length > 1;
    const root = this.deps.root();
    const note = chosen.format !== job.format ? `Used ${FORMAT_LABELS[chosen.format]} (no ${FORMAT_LABELS[job.format as FriendlyFormat]})` : null;

    const [firstFile, ...rest] = chosen.files;
    if (!firstFile) return null;
    const fields = (file: typeof firstFile) => ({
      fileName: file.name,
      format: chosen.format,
      destPath: absoluteDestination(
        root,
        relativeDestination({ item: fullItem, publicationFallback, fileName: file.name, multiFile }),
      ),
      bytesTotal: fileSize(file),
      md5: file.md5 ?? null,
      note,
    });

    const now = Date.now();
    this.db.transaction((tx) => {
      rest.forEach((file, i) => {
        tx.insert(downloadTasks)
          .values({
            id: randomUUID(),
            jobId: task.jobId,
            seq: task.seq + i + 1,
            identifier: task.identifier,
            itemJson: task.itemJson,
            state: 'queued',
            updatedAt: now,
            ...fields(file),
          })
          .run();
      });
    });
    const updated = this.update(task.id, fields(firstFile));
    if (rest.length > 0) {
      const job2 = this.getJob(task.jobId);
      if (job2) this.emitEvent({ type: 'job', job: job2 });
      this.schedule();
    }
    return updated;
  }

  private async download(task: TaskRow, signal: AbortSignal): Promise<void> {
    const dest = task.destPath!;
    // Two jobs may target the same file; let the first finish, then treat it as existing.
    const pending = this.inflight.get(dest);
    if (pending) {
      this.update(task.id, { state: 'downloading', note: 'Waiting for the same file in another job' });
      await pending.catch(() => undefined);
    }

    if (await this.alreadyHave(task)) {
      this.update(task.id, { state: 'done', bytesDone: task.bytesTotal ?? 0, note: 'Already had it' });
      return;
    }

    const work = this.transfer(task, signal);
    this.inflight.set(dest, work);
    try {
      await work;
    } finally {
      if (this.inflight.get(dest) === work) this.inflight.delete(dest);
    }
  }

  private async transfer(task: TaskRow, signal: AbortSignal): Promise<void> {
    const dest = task.destPath!;
    const part = `${dest}.part`;
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const url = this.deps.fileUrl(task.identifier, task.fileName!);

    for (let verifyAttempt = 1; ; verifyAttempt++) {
      this.update(task.id, { state: 'downloading', note: task.note });
      await this.withRetries(task, signal, () =>
        downloadToFile({
          url,
          partPath: part,
          expectedSize: task.bytesTotal,
          signal,
          stallMs: this.deps.stallMs,
          fetchImpl: this.deps.fetchImpl,
          throttle: this.deps.throttle,
          onProgress: (done, total) => this.progress(task.id, done, total),
        }),
      );

      this.update(task.id, { state: 'verifying' });
      const problem = await verify(part, task.bytesTotal, task.md5);
      if (!problem) break;
      await fsp.rm(part, { force: true });
      if (verifyAttempt >= 2) throw new Error(`Downloaded file failed verification (${problem})`);
    }

    await fsp.rename(part, dest);
    invalidateLibraryScan();
    const size = await fileSizeOrZero(dest);
    this.update(task.id, { state: 'done', bytesDone: size, bytesTotal: task.bytesTotal ?? size });
  }

  private async alreadyHave(task: TaskRow): Promise<boolean> {
    const size = await fileSizeOrZero(task.destPath!);
    if (size === 0) return false;
    return task.bytesTotal === null || size === task.bytesTotal;
  }

  private async withRetries<T>(task: TaskRow, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw new CancelledError();
      this.update(task.id, { attempts: attempt });
      try {
        return await fn();
      } catch (error) {
        if (signal.aborted) throw new CancelledError();
        const retryable =
          error instanceof StallError ||
          (error instanceof HttpStatusError && error.retryable) ||
          isNetworkError(error) ||
          (error instanceof Error && error.name === 'UpstreamError' && !('status' in error && (error as { status?: number }).status === 404));
        if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
        const wait = this.deps.backoffMs(attempt, error instanceof HttpStatusError ? error.retryAfterMs : undefined);
        this.update(task.id, { note: `Retrying (${describeError(error)})` });
        await sleep(wait, signal);
      }
    }
  }

  /* ------------------------------ persistence + events ------------------------------ */

  private progress(taskId: string, bytesDone: number, bytesTotal: number | null): void {
    const now = Date.now();
    const entry = this.live.get(taskId) ?? { bytesDone: 0, persistedAt: 0 };
    entry.bytesDone = bytesDone;
    if (now - entry.persistedAt >= PERSIST_EVERY_MS) {
      entry.persistedAt = now;
      this.db.update(downloadTasks).set({ bytesDone, updatedAt: now }).where(eq(downloadTasks.id, taskId)).run();
    }
    this.live.set(taskId, entry);
    const row = this.db.select().from(downloadTasks).where(eq(downloadTasks.id, taskId)).get();
    if (row) this.emitEvent({ type: 'task', task: { ...this.view(row), bytesDone, bytesTotal: bytesTotal ?? row.bytesTotal } });
  }

  private update(taskId: string, patch: Partial<TaskRow>): TaskRow {
    const row = this.db
      .update(downloadTasks)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(downloadTasks.id, taskId))
      .returning()
      .get();
    if (row) this.emitEvent({ type: 'task', task: this.view(row) });
    return row;
  }

  private view(row: TaskRow): TaskView {
    const item = JSON.parse(row.itemJson) as TrayItem;
    const live = this.live.get(row.id);
    return {
      id: row.id,
      jobId: row.jobId,
      identifier: row.identifier,
      title: item.title,
      section: item.section,
      fileName: row.fileName,
      destPath: row.destPath,
      state: row.state as TaskState,
      note: row.note,
      bytesDone: live && row.state === 'downloading' ? live.bytesDone : row.bytesDone,
      bytesTotal: row.bytesTotal,
      attempts: row.attempts,
    };
  }

  private emitEvent(event: DownloadEvent): void {
    this.emit('event', event);
  }
}

async function verify(file: string, size: number | null, md5: string | null): Promise<string | null> {
  const actual = await fileSizeOrZero(file);
  if (size !== null && actual !== size) return `size ${actual} ≠ ${size}`;
  if (md5 && (await md5OfFile(file)) !== md5.toLowerCase()) return 'checksum mismatch';
  return null;
}

function isDiskFull(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOSPC';
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TypeError' && /fetch failed|terminated|network/i.test(error.message)) return true;
  const code = (error as { code?: string }).code ?? (error.cause as { code?: string } | undefined)?.code;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'EPIPE'].includes(code ?? '');
}

function describeError(error: unknown): string {
  if (error instanceof HttpStatusError) {
    if (error.status === 403) return 'Access denied by archive.org';
    if (error.status === 404) return 'File not found on archive.org';
    return `archive.org responded ${error.status}`;
  }
  if (error instanceof StallError) return 'Connection stalled';
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    if (code === 'EACCES' || code === 'EPERM') return 'No permission to write to the download folder';
    return error.message;
  }
  return 'Unknown error';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new CancelledError());
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new CancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
