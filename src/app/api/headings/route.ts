import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { ensureBookText } from '@/lib/server/library/bookText';
import { headingsInBook } from '@/lib/server/library/headings';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Where chapters start, from a heading word: GET ?file=&word=. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const word = (sp.get('word') ?? '').trim();
  if (!word || word.length > 40) return apiError(400, 'VALIDATION_ERROR', 'Type the word chapter headings use, e.g. सर्गः.');
  const file = await findLibraryFile(getSettings().downloadRoot, sp.get('file') ?? '');
  if (!file || file.ext !== 'pdf') return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  try {
    const info = await ensureBookText(file.path, file.relative);
    return NextResponse.json({ data: { searchable: info.searchable, headings: headingsInBook(file.relative, word) } });
  } catch {
    return apiError(422, 'UNREADABLE', 'Couldn’t read this PDF’s text.');
  }
}
