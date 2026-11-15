import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { saveProgress } from './progress';
import { addReadingTime, isFinished, readingStats } from './stats';

beforeEach(() => setDbForTests(openDb(':memory:')));
afterEach(() => setDbForTests(undefined));

describe('reading stats', () => {
  it('adds up time and pages by day, period and book; counts the streak', () => {
    const now = new Date(2026, 10, 15, 20, 0); // Sunday 15 Nov 2026
    addReadingTime('a.pdf', 600, 12, '2026-11-15');
    addReadingTime('a.pdf', 300, 3, '2026-11-15');
    addReadingTime('b.pdf', 1200, 20, '2026-11-14');
    addReadingTime('b.pdf', 900, 9, '2026-11-13');
    addReadingTime('a.pdf', 60, 1, '2026-11-01');
    addReadingTime('b.pdf', 30, 0, '2026-10-20');
    saveProgress({ file: 'b.pdf', identifier: null, title: 'Raghuvansham', page: 332, total: 332 });
    saveProgress({ file: 'a.pdf', identifier: null, title: 'Geeta', page: 40, total: 302 });

    const s = readingStats(now, 30);
    expect(s.week).toEqual({ seconds: 3000, pages: 44, books: 2, days: 3 });
    expect(s.month.seconds).toBe(3060);
    expect(s.year.seconds).toBe(3090);
    expect(s.daily).toHaveLength(30);
    expect(s.daily.at(-1)).toEqual({ day: '2026-11-15', seconds: 900, pages: 15 });
    expect(s.streak).toBe(3);
    expect(s.topBooks.map((b) => [b.title, b.seconds])).toEqual([
      ['Raghuvansham', 2130],
      ['Geeta', 960],
    ]);
    expect(s.finished.map((f) => f.title)).toEqual(['Raghuvansham']);
  });

  it('knows when a text file is finished (thousandths)', () => {
    expect(isFinished(995, 1000)).toBe(true);
    expect(isFinished(500, 1000)).toBe(false);
    expect(isFinished(1, 1)).toBe(false);
  });
});
