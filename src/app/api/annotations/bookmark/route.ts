import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { toggleBookmark } from '@/lib/server/library/annotations';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const schema = z.object({ file: z.string().min(1).max(1000), page: z.number().int().min(1).max(100_000) });

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  const root = getSettings().downloadRoot;
  if (!(await findLibraryFile(root, body.data.file))) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  const { identifier } = await titleForFile(root, body.data.file);
  const bookmark = toggleBookmark(body.data.file, identifier, body.data.page);
  return NextResponse.json({ data: { bookmarked: Boolean(bookmark), bookmark } });
}
