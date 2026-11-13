import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const bodySchema = z.union([z.object({ taskId: z.string().uuid() }), z.object({ root: z.literal(true) })]);

/** Shows a downloaded file (or the download folder) in Finder. Paths come from our DB, never from the client. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;

  const root = getSettings().downloadRoot;
  let target: string;
  if ('taskId' in body.data) {
    const task = getManager().getTask(body.data.taskId);
    if (!task?.destPath) return apiError(404, 'NOT_FOUND', 'No file for this download.');
    target = fs.existsSync(task.destPath) ? task.destPath : path.dirname(task.destPath);
  } else {
    fs.mkdirSync(root, { recursive: true });
    target = root;
  }
  if (process.platform !== 'darwin') return apiError(501, 'UNSUPPORTED', 'Reveal is only available on macOS.');
  await new Promise<void>((resolve) => execFile('open', ['-R', target], () => resolve()));
  return NextResponse.json({ data: { ok: true } });
}
