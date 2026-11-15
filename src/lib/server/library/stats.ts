import { desc, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { readingDays, readingProgress } from '../db/schema';

/** Reading history: time and pages per day per book, and the Finished shelf. */

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addReadingTime(file: string, seconds: number, pages: number, day = localDay()): void {
  getDb()
    .insert(readingDays)
    .values({ file, day, seconds, pages })
    .onConflictDoUpdate({
      target: [readingDays.file, readingDays.day],
      set: { seconds: sql`${readingDays.seconds} + ${seconds}`, pages: sql`${readingDays.pages} + ${pages}` },
    })
    .run();
}

export interface PeriodTotals {
  seconds: number;
  pages: number;
  books: number;
  days: number;
}

export interface ReadingStats {
  week: PeriodTotals;
  month: PeriodTotals;
  year: PeriodTotals;
  /** Seconds per day for the calendar, oldest first, `days` long, ending today. */
  daily: { day: string; seconds: number; pages: number }[];
  /** Days in a row with some reading, up to today (or yesterday, if nothing yet today). */
  streak: number;
  topBooks: { file: string; title: string; seconds: number; pages: number }[];
  finished: { file: string; title: string; finishedAt: number }[];
}

function totals(rows: { file: string; day: string; seconds: number; pages: number }[], from: string): PeriodTotals {
  const inPeriod = rows.filter((r) => r.day >= from);
  return {
    seconds: inPeriod.reduce((s, r) => s + r.seconds, 0),
    pages: inPeriod.reduce((s, r) => s + r.pages, 0),
    books: new Set(inPeriod.map((r) => r.file)).size,
    days: new Set(inPeriod.filter((r) => r.seconds > 0).map((r) => r.day)).size,
  };
}

/** A file counts as finished on reaching its last page (PDF) or the last 1% (text, stored in thousandths). */
export function isFinished(page: number, total: number): boolean {
  return total === 1000 ? page >= 990 : page >= total && total > 1;
}

export function readingStats(now = new Date(), days = 182): ReadingStats {
  const db = getDb();
  const start = new Date(now);
  start.setDate(start.getDate() - 365);
  const rows = db.select().from(readingDays).where(gte(readingDays.day, localDay(start))).all();

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const byDay = new Map<string, { seconds: number; pages: number }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { seconds: 0, pages: 0 };
    d.seconds += r.seconds;
    d.pages += r.pages;
    byDay.set(r.day, d);
  }
  const daily: ReadingStats['daily'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localDay(d);
    daily.push({ day: key, ...(byDay.get(key) ?? { seconds: 0, pages: 0 }) });
  }

  let streak = 0;
  const cursor = new Date(now);
  if (!(byDay.get(localDay(cursor))?.seconds ?? 0)) cursor.setDate(cursor.getDate() - 1);
  while ((byDay.get(localDay(cursor))?.seconds ?? 0) >= 60) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const titles = new Map(db.select({ file: readingProgress.file, title: readingProgress.title }).from(readingProgress).all().map((r) => [r.file, r.title]));
  const perBook = new Map<string, { seconds: number; pages: number }>();
  for (const r of rows) {
    const b = perBook.get(r.file) ?? { seconds: 0, pages: 0 };
    b.seconds += r.seconds;
    b.pages += r.pages;
    perBook.set(r.file, b);
  }
  const topBooks = [...perBook.entries()]
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 8)
    .map(([file, v]) => ({ file, title: titles.get(file) ?? file.split('/').pop()!, ...v }));

  const finished = db
    .select()
    .from(readingProgress)
    .orderBy(desc(readingProgress.updatedAt))
    .all()
    .filter((p) => isFinished(p.page, p.total))
    .map((p) => ({ file: p.file, title: p.title, finishedAt: p.updatedAt }));

  return {
    week: totals(rows, localDay(weekStart)),
    month: totals(rows, localDay(monthStart)),
    year: totals(rows, localDay(yearStart)),
    daily,
    streak,
    topBooks,
    finished,
  };
}
