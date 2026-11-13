import { getDb } from '../db/client';
import { pruneCache } from '../http';
import { getSettings } from '../settings';
import { DownloadManager } from './manager';

const globalForManager = globalThis as unknown as { __stacksManager?: DownloadManager };

/** The process-wide download manager. Pinned on globalThis so dev reloads never start a second queue. */
export function getManager(): DownloadManager {
  if (!globalForManager.__stacksManager) {
    const manager = new DownloadManager({
      db: getDb(),
      root: () => getSettings().downloadRoot,
      concurrency: () => getSettings().concurrency,
    });
    globalForManager.__stacksManager = manager;
    try {
      pruneCache();
    } catch {
      /* cache pruning is best-effort */
    }
    manager.init();
  }
  return globalForManager.__stacksManager;
}
