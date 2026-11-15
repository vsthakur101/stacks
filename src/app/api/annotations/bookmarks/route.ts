import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { addNamedBookmarks } from '@/lib/server/library/annotations';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const schema = z.object({
  file: z.string().min(1).max(1000),
  marks: z.array(z.object({ page: z.number().int().min(1).max(100_000), name: z.string().trim().min(1).max(200) })).min(1).max(500),
});

/** Adds several named bookmarks (Contents from headings). Existing bookmarks are kept. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  const root = getSettings().downloadRoot;
  if (!(await findLibraryFile(root, body.data.file))) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  const { identifier } = await titleForFile(root, body.data.file);
  return NextResponse.json({ data: addNamedBookmarks(body.data.file, identifier, body.data.marks) }, { status: 201 });
}
