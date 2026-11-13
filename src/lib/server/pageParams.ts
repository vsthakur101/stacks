/** Helpers for reading Next.js search params safely. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export function pageNum(v: string | string[] | undefined, max = 400): number {
  const n = Number(str(v));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : 1;
}

/** Runs a loader; returns null instead of throwing so pages can render a calm error state. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('[stacks] loader failed:', error);
    return null;
  }
}
