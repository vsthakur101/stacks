import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { ensureBookText, getPageOffset, setPageOffset, suggestedOffsetFor } from '@/lib/server/library/bookText';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Per-book facts for the reader: printed-page offset (saved, and suggested from folios unless suggest=0). */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const file = await findLibraryFile(getSettings().downloadRoot, sp.get('file') ?? '');
  if (!file || file.ext !== 'pdf') return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  let suggestedOffset: number | null = null;
  let searchable = false;
  // suggest=0: only the saved offset, without reading the book's text.
  if (sp.get('suggest') !== '0') try {
    searchable = (await ensureBookText(file.path, file.relative)).searchable;
    suggestedOffset = searchable ? suggestedOffsetFor(file.relative) : null;
  } catch {
    // An unreadable text layer only means no suggestion.
  }
  return NextResponse.json({ data: { pageOffset: getPageOffset(file.relative), suggestedOffset, searchable } });
}

const patchSchema = z.object({ file: z.string().min(1).max(1000), pageOffset: z.number().int().min(-2000).max(2000).nullable() });

export async function PATCH(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, patchSchema);
  if ('error' in body) return body.error;
  const file = await findLibraryFile(getSettings().downloadRoot, body.data.file);
  if (!file) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  setPageOffset(file.relative, body.data.pageOffset);
  return NextResponse.json({ data: { pageOffset: body.data.pageOffset } });
}
