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
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  downloadRoot: path.join(os.homedir(), 'Books', 'Archive'),
  concurrency: 3,
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

export function saveSettings(next: Settings): Settings {
  const value = settingsSchema.parse({ ...next, downloadRoot: expandHome(next.downloadRoot) });
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
