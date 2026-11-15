import { describe, expect, it } from 'vitest';
import { inWindow, Throttle } from './limits';

const at = (h: number, m = 0) => new Date(2026, 10, 15, h, m);

describe('download window', () => {
  it('handles same-day and overnight windows', () => {
    expect(inWindow(at(10), '09:00', '17:00')).toBe(true);
    expect(inWindow(at(17), '09:00', '17:00')).toBe(false);
    expect(inWindow(at(23, 30), '23:00', '07:00')).toBe(true);
    expect(inWindow(at(3), '23:00', '07:00')).toBe(true);
    expect(inWindow(at(12), '23:00', '07:00')).toBe(false);
    expect(inWindow(at(12), '00:00', '00:00')).toBe(true);
  });
});

describe('bandwidth cap', () => {
  it('makes callers wait in proportion to what they take over the cap', async () => {
    const waits: number[] = [];
    const t = new Throttle(() => 1000, async (ms) => void waits.push(Math.round(ms)));
    await t.take(500); // within the first second's allowance? starts at 0 tokens
    await t.take(1500);
    expect(waits[0]).toBeGreaterThanOrEqual(490);
    expect(waits.at(-1)!).toBeGreaterThanOrEqual(1900);
  });

  it('does nothing without a cap', async () => {
    const waits: number[] = [];
    await new Throttle(() => 0, async (ms) => void waits.push(ms)).take(1e9);
    expect(waits).toEqual([]);
  });
});
