/**
 * Runs once when the server starts: wake the download queue so interrupted work resumes without a
 * page visit; start the daily backup copy and the background reading of book text (Library search).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getManager } = await import('./lib/server/downloads/instance');
  getManager();
  const { startDailyBackups } = await import('./lib/server/backup');
  startDailyBackups();
  const { startLibraryIndexing } = await import('./lib/server/library/librarySearch');
  startLibraryIndexing();
  const { startRemoteAccess } = await import('./lib/server/remote/proxy');
  startRemoteAccess();
}
