import { eq } from 'drizzle-orm';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { getDb } from './db/client';
import { settings } from './db/schema';

export const settingsSchema = z.object({
  downloadRoot: z
    .string()
    .trim()
    .min(1)
    .refine((p) => path.isAbsolute(p.replace(/^~(?=$|\/)/, os.homedir())), 'Must be an absolute path'),
  concurrency: z.number().int().min(1).max(6),
  /** Shared cap for all downloads, KB/s; 0 = no limit. */
  bandwidthKBps: z.number().int().min(0).max(1_000_000).default(0),
  /** Only download inside a daily window (may wrap past midnight). */
  windowEnabled: z.boolean().default(false),
  windowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('23:00'),
  windowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('07:00'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  downloadRoot: path.join(os.homedir(), 'Books', 'Archive'),
  concurrency: 3,
  bandwidthKBps: 0,
  windowEnabled: false,
  windowStart: '23:00',
  windowEnd: '07:00',
};

export function getSettings(): Settings {
  const rows = getDb().select().from(settings).all();
  const raw: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      /* ignore corrupt row; default stays */
    }
  }
  const parsed = settingsSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  return { ...value, downloadRoot: expandHome(value.downloadRoot) };
}

/** Saves settings; fields left out keep their current values. */
export function saveSettings(next: z.input<typeof settingsSchema>): Settings {
  const value = settingsSchema.parse({ ...getSettings(), ...next, downloadRoot: expandHome(next.downloadRoot) });
  const db = getDb();
  for (const [key, v] of Object.entries(value)) {
    const json = JSON.stringify(v);
    db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
  }
  return value;
}

export function deleteSetting(key: keyof Settings): void {
  getDb().delete(settings).where(eq(settings.key, key)).run();
}

function expandHome(p: string): string {
  return path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));
}
