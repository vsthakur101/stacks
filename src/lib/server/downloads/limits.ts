/**
 * Download scheduling and limits: a daily time window (downloads run only inside it; it may wrap past
 * midnight, e.g. 23:00–07:00) and one bandwidth cap shared by every running download.
 */

/** Minutes since midnight for "HH:MM". */
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether `now` (local time) is inside the window. Equal start and end means all day. */
export function inWindow(now: Date, start: string, end: string): boolean {
  const s = minutes(start);
  const e = minutes(end);
  const t = now.getHours() * 60 + now.getMinutes();
  if (s === e) return true;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * A token bucket shared by all downloads: `take(bytes)` waits as long as needed to keep the total
 * rate at or under the cap. A cap of 0 means no limit. Allows a one-second burst.
 */
export class Throttle {
  private tokens = 0;
  private last = Date.now();
  constructor(private readonly bytesPerSecond: () => number, private readonly sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}

  async take(bytes: number): Promise<void> {
    const rate = this.bytesPerSecond();
    if (!rate) return;
    const now = Date.now();
    this.tokens = Math.min(rate, this.tokens + ((now - this.last) / 1000) * rate);
    this.last = now;
    this.tokens -= bytes;
    if (this.tokens < 0) await this.sleep((-this.tokens / rate) * 1000);
  }
}
