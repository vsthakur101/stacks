import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { findLibraryFile } from '@/lib/server/library/scan';
import { addReadingTime } from '@/lib/server/library/stats';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Adds reading time sent by the reader (at most two minutes per call). */
const schema = z.object({ file: z.string().min(1).max(1000), seconds: z.number().int().min(0).max(120), pages: z.number().int().min(0).max(100) });

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  if (!(await findLibraryFile(getSettings().downloadRoot, body.data.file))) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  if (body.data.seconds || body.data.pages) addReadingTime(body.data.file, body.data.seconds, body.data.pages);
  return NextResponse.json({ data: { ok: true } });
}
