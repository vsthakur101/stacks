import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { isShelfPath, saveShelf } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  path: z.string().max(40),
  params: z.record(z.string().max(20), z.union([z.string().max(300), z.array(z.string().max(300)).max(20)])),
});

/** Pins the current search to Home as a shelf. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;
  if (!isShelfPath(body.data.path)) return apiError(400, 'NOT_SAVABLE', 'Only searches can be saved as shelves.');
  const id = saveShelf(body.data.title, body.data.path, body.data.params);
  return NextResponse.json({ data: { id } }, { status: 201 });
}
