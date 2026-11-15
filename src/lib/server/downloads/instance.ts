import { getDb } from '../db/client';
import { pruneCache } from '../http';
import { startConnectionWarming } from '../net';
import { getSettings } from '../settings';
import { inWindow, Throttle } from './limits';
import { DownloadManager } from './manager';

const globalForManager = globalThis as unknown as { __stacksManager?: DownloadManager };

/** The process-wide download manager. Pinned on globalThis so dev reloads never start a second queue. */
export function getManager(): DownloadManager {
  if (!globalForManager.__stacksManager) {
    const manager = new DownloadManager({
      db: getDb(),
      root: () => getSettings().downloadRoot,
      concurrency: () => getSettings().concurrency,
      window: () => {
        const s = getSettings();
        return s.windowEnabled ? { open: inWindow(new Date(), s.windowStart, s.windowEnd), text: `Downloads run between ${s.windowStart} and ${s.windowEnd}.` } : null;
      },
      throttle: (() => {
        const t = new Throttle(() => getSettings().bandwidthKBps * 1024);
        return (bytes: number) => t.take(bytes);
      })(),
    });
    globalForManager.__stacksManager = manager;
    try {
      pruneCache();
    } catch {
      /* cache pruning is best-effort */
    }
    manager.init();
    startConnectionWarming();
  }
  return globalForManager.__stacksManager;
}
