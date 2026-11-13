import type { DownloadEvent } from '@/lib/shared/types';
import { guard } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';

export const dynamic = 'force-dynamic';

const TASK_THROTTLE_MS = 250;

/** Server-sent events: a snapshot, then task/job/queue updates. Per-task progress is throttled to ~4/s. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const manager = getManager();
  const encoder = new TextEncoder();

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const lastSent = new Map<string, number>();
      const pending = new Map<string, NodeJS.Timeout>();
      const send = (event: DownloadEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onEvent = (event: DownloadEvent) => {
        if (event.type !== 'task' || event.task.state !== 'downloading') {
          if (event.type === 'task') {
            clearTimeout(pending.get(event.task.id));
            pending.delete(event.task.id);
          }
          send(event);
          return;
        }
        const id = event.task.id;
        const wait = TASK_THROTTLE_MS - (Date.now() - (lastSent.get(id) ?? 0));
        clearTimeout(pending.get(id));
        const fire = () => {
          lastSent.set(id, Date.now());
          pending.delete(id);
          send(event);
        };
        if (wait <= 0) fire();
        else pending.set(id, setTimeout(fire, wait));
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 20_000);

      cleanup = () => {
        manager.off('event', onEvent);
        clearInterval(heartbeat);
        for (const t of pending.values()) clearTimeout(t);
        pending.clear();
      };
      manager.on('event', onEvent);
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      send({ type: 'snapshot', jobs: manager.listJobs(), queue: manager.queueStatus() });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
