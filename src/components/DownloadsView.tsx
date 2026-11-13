'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, formatBytes } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { FORMAT_LABELS, TERMINAL_STATES, type DownloadEvent, type JobView, type QueueStatus, type TaskView } from '@/lib/shared/types';

type Conn = 'connecting' | 'open' | 'lost';

export function DownloadsView() {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [queue, setQueue] = useState<QueueStatus>({ paused: false, pauseReason: null });
  const [conn, setConn] = useState<Conn>('connecting');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/downloads/events');
    source.onopen = () => setConn('open');
    source.onerror = () => setConn('lost'); // EventSource reconnects on its own and sends a fresh snapshot.
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as DownloadEvent;
      switch (event.type) {
        case 'snapshot':
          setJobs(event.jobs);
          setQueue(event.queue);
          break;
        case 'queue':
          setQueue(event.queue);
          break;
        case 'job':
          setJobs((prev) => {
            const list = prev ?? [];
            return list.some((j) => j.id === event.job.id)
              ? list.map((j) => (j.id === event.job.id ? event.job : j))
              : [event.job, ...list];
          });
          break;
        case 'task':
          setJobs((prev) =>
            (prev ?? []).map((j) => {
              if (j.id !== event.task.jobId) return j;
              const exists = j.tasks.some((t) => t.id === event.task.id);
              return { ...j, tasks: exists ? j.tasks.map((t) => (t.id === event.task.id ? event.task : t)) : [...j.tasks, event.task] };
            }),
          );
          break;
      }
    };
    return () => source.close();
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const anyFinished = jobs?.some((j) => j.tasks.every((t) => TERMINAL_STATES.includes(t.state)));

  return (
    <div>
      <div className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <button type="button" onClick={() => act(() => api('/api/reveal', { body: { root: true } }))} className="text-accent underline-offset-4 hover:underline">
          Open download folder
        </button>
        {anyFinished ? (
          <button type="button" onClick={() => act(() => api('/api/downloads/clear', { body: {} }))} className="text-ink-soft hover:text-ink">
            Clear finished
          </button>
        ) : null}
        {conn === 'lost' ? <span className="text-ink-faint">Reconnecting to the download queue…</span> : null}
      </div>

      {queue.paused ? (
        <div role="alert" className="mb-10 flex flex-wrap items-center justify-between gap-4 border-l-2 border-danger pl-4">
          <p className="text-ink">Downloads are paused. {queue.pauseReason}</p>
          <button
            type="button"
            onClick={() => act(() => api('/api/downloads/resume', { body: {} }))}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink"
          >
            Resume downloads
          </button>
        </div>
      ) : null}
      {actionError ? <p className="mb-6 text-sm text-danger">{actionError}</p> : null}

      {jobs === null ? (
        <p className="flex items-center gap-2 text-ink-soft">
          <Loader2 className="size-4 animate-spin" /> Loading downloads…
        </p>
      ) : jobs.length === 0 ? (
        <div className="max-w-prose py-12">
          <p className="font-title text-xl text-ink">Nothing downloading.</p>
          <p className="mt-2 text-ink-soft">
            Select items with the + on any cover, then choose Review and download.
          </p>
        </div>
      ) : (
        <div className="space-y-14">
          {jobs.map((job) => (
            <Job key={job.id} job={job} onAct={act} />
          ))}
        </div>
      )}
    </div>
  );
}

function Job({ job, onAct }: { job: JobView; onAct: (fn: () => Promise<unknown>) => void }) {
  const stats = useMemo(() => {
    const count = (s: TaskView['state'][]) => job.tasks.filter((t) => s.includes(t.state)).length;
    const bytesTotal = job.tasks.reduce((n, t) => n + (t.bytesTotal ?? 0), 0);
    const bytesDone = job.tasks.reduce((n, t) => n + (t.state === 'done' ? (t.bytesTotal ?? t.bytesDone) : t.bytesDone), 0);
    return {
      done: count(['done']),
      failed: count(['failed']),
      skipped: count(['skipped']),
      cancelled: count(['cancelled']),
      active: count(['queued', 'resolving', 'downloading', 'verifying']),
      bytesTotal,
      bytesDone,
    };
  }, [job.tasks]);
  const finished = stats.active === 0;
  const started = new Date(job.createdAt);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-3">
        <div>
          <h2 className="font-title text-xl text-ink">
            {job.tasks.length} {job.tasks.length === 1 ? 'file' : 'files'} as {FORMAT_LABELS[job.format]}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Started {started.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at{' '}
            {started.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.{' '}
            {[
              `${stats.done} done`,
              stats.active ? `${stats.active} to go` : null,
              stats.skipped ? `${stats.skipped} skipped` : null,
              stats.failed ? `${stats.failed} failed` : null,
              stats.cancelled ? `${stats.cancelled} cancelled` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            {stats.bytesTotal > 0 ? `. ${formatBytes(stats.bytesDone)} of ${formatBytes(stats.bytesTotal)}` : ''}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          {stats.failed + stats.cancelled > 0 ? (
            <button type="button" onClick={() => onAct(() => api(`/api/downloads/${job.id}/retry`, { body: {} }))} className="text-accent hover:underline">
              Retry {stats.failed + stats.cancelled === 1 ? 'the one that stopped' : `${stats.failed + stats.cancelled} that stopped`}
            </button>
          ) : null}
          {!finished ? (
            <button type="button" onClick={() => onAct(() => api(`/api/downloads/${job.id}`, { method: 'DELETE', body: {} }))} className="text-ink-soft hover:text-danger">
              Cancel
            </button>
          ) : null}
        </div>
      </div>
      {!finished && stats.bytesTotal > 0 ? <Bar value={stats.bytesDone / stats.bytesTotal} className="mt-0" /> : null}

      <ul className="divide-y divide-rule">
        {job.tasks.map((t) => (
          <TaskRow key={t.id} task={t} onAct={onAct} />
        ))}
      </ul>
    </section>
  );
}

const STATE_TEXT: Record<TaskView['state'], string> = {
  queued: 'Waiting',
  resolving: 'Checking formats',
  downloading: 'Downloading',
  verifying: 'Checking the file',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function TaskRow({ task, onAct }: { task: TaskView; onAct: (fn: () => Promise<unknown>) => void }) {
  const pct = task.bytesTotal ? task.bytesDone / task.bytesTotal : 0;
  const fileName = task.destPath?.split('/').pop();
  return (
    <li className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0">
        <p className="truncate font-title text-ink">{task.title}</p>
        {fileName ? <p className="truncate text-xs text-ink-faint">{fileName}</p> : null}
      </div>
      <div className="text-sm sm:text-right">
        <p
          className={cn(
            task.state === 'failed' ? 'text-danger' : task.state === 'done' ? 'text-accent' : 'text-ink-soft',
          )}
        >
          {STATE_TEXT[task.state]}
          {task.state === 'downloading' && task.bytesTotal ? ` ${Math.floor(pct * 100)}%` : ''}
          {task.state === 'done' && task.destPath ? (
            <>
              {', '}
              <button type="button" onClick={() => onAct(() => api('/api/reveal', { body: { taskId: task.id } }))} className="underline-offset-4 hover:underline">
                show in Finder
              </button>
            </>
          ) : null}
        </p>
        {task.note ? <p className="text-xs text-ink-faint">{task.note}</p> : null}
        {task.state === 'downloading' ? <Bar value={pct} className="mt-1.5" /> : null}
      </div>
    </li>
  );
}

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn('h-[3px] w-full overflow-hidden bg-rule', className)}
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}
