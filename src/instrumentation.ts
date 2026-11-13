/** Runs once when the server starts: wake the download queue so interrupted work resumes without a page visit. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getManager } = await import('./lib/server/downloads/instance');
  getManager();
}
