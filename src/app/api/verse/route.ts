import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { ensureBookText } from '@/lib/server/library/bookText';
import { findLibraryFile } from '@/lib/server/library/scan';
import { locateVerse, parseVerseRef } from '@/lib/server/library/verses';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Jump to a verse: GET ?file=&ref=47|2.47&from=<current page>. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const ref = parseVerseRef(sp.get('ref') ?? '');
  if (!ref) return apiError(400, 'VALIDATION_ERROR', 'Type a verse number like 47, or chapter.verse like 2.47.');
  const file = await findLibraryFile(getSettings().downloadRoot, sp.get('file') ?? '');
  if (!file || file.ext !== 'pdf') return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  try {
    await ensureBookText(file.path, file.relative);
  } catch {
    return apiError(422, 'UNREADABLE', 'Couldn’t read this PDF’s text.');
  }
  const result = locateVerse(file.relative, ref, Math.max(1, Number(sp.get('from')) || 1));
  return 'error' in result ? apiError(404, 'NOT_FOUND', result.error) : NextResponse.json({ data: result });
}
