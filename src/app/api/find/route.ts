import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { ensureBookText, findInBook } from '@/lib/server/library/bookText';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** Find in a downloaded PDF: GET ?file=<path in download folder>&q=<text>[&close=0]. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim();
  if (!q || q.length > 200) return apiError(400, 'VALIDATION_ERROR', 'Type 1–200 characters to find.');
  const file = await findLibraryFile(getSettings().downloadRoot, sp.get('file') ?? '');
  if (!file || file.ext !== 'pdf') return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  try {
    const info = await ensureBookText(file.path, file.relative);
    const result = await findInBook(file.relative, q, { close: sp.get('close') !== '0' });
    return NextResponse.json({ data: { ...result, searchable: info.searchable, pages: info.pages } });
  } catch (error) {
    return apiError(422, 'UNREADABLE', `Couldn’t read this PDF’s text: ${error instanceof Error ? error.message : 'unknown error'}.`);
  }
}
