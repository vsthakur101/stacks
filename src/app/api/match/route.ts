import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { getItem, isSafeIdentifier } from '@/lib/server/catalog/archive';
import { linkFile, matchCandidates, unlinkFile } from '@/lib/server/library/match';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Candidate archive.org items for one of your own files: GET ?file=[&q=search words]. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const file = await findLibraryFile(getSettings().downloadRoot, sp.get('file') ?? '');
  if (!file) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  try {
    return NextResponse.json({ data: await matchCandidates(file, sp.get('q')?.slice(0, 200) ?? undefined) });
  } catch {
    return apiError(502, 'UPSTREAM', 'archive.org didn’t answer. Try again in a moment.');
  }
}

const linkSchema = z.object({ file: z.string().min(1).max(1000), identifier: z.string().min(1).max(100) });

/** Links the file to an item (recorded in Stacks; the file isn't renamed). */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, linkSchema);
  if ('error' in body) return body.error;
  if (!isSafeIdentifier(body.data.identifier)) return apiError(400, 'VALIDATION_ERROR', 'That isn’t an archive.org identifier.');
  const file = await findLibraryFile(getSettings().downloadRoot, body.data.file);
  if (!file) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  try {
    await getItem(body.data.identifier);
  } catch {
    return apiError(404, 'NOT_FOUND', 'No such archive.org item.');
  }
  linkFile(file, body.data.identifier);
  return NextResponse.json({ data: { ok: true } });
}

export async function DELETE(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, z.object({ file: z.string().min(1).max(1000) }));
  if ('error' in body) return body.error;
  return unlinkFile(body.data.file) ? NextResponse.json({ data: { ok: true } }) : apiError(404, 'NOT_FOUND', 'That file isn’t linked.');
}
