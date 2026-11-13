import { execFile } from 'node:child_process';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { filesFor } from '@/lib/server/downloads/library';
import { identifierSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ identifier: identifierSchema, action: z.enum(['open', 'reveal']) });

/**
 * Opens a downloaded item in its default app, or shows it in Finder. Paths come from our own download
 * records, never from the request. An item with several files opens its folder.
 */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;
  if (process.platform !== 'darwin') return apiError(501, 'UNSUPPORTED', 'Opening files is only available on macOS.');

  const files = filesFor(body.data.identifier);
  const file = files[0];
  if (!file) return apiError(404, 'NOT_DOWNLOADED', 'This item isn’t in your download folder any more.');
  const args =
    body.data.action === 'reveal' ? ['-R', file] : files.length > 1 ? [path.dirname(file)] : [file];
  await new Promise<void>((resolve) => execFile('open', args, () => resolve()));
  return NextResponse.json({ data: { ok: true } });
}
