import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';
import { getSettings, saveSettings, settingsSchema } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ data: getSettings() });
}

export async function PUT(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, settingsSchema);
  if ('error' in body) return body.error;
  try {
    const saved = saveSettings(body.data);
    // A new window or cap applies at once.
    getManager().checkWindow();
    await fs.mkdir(saved.downloadRoot, { recursive: true });
    await fs.access(saved.downloadRoot, fs.constants.W_OK);
    return NextResponse.json({ data: saved });
  } catch (error) {
    return apiError(400, 'FOLDER_NOT_WRITABLE', 'That folder can’t be created or written to.', String(error));
  }
}
