import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { getDb } from '@/lib/server/db/client';
import { bookTextPages } from '@/lib/server/db/schema';
import type { PageItem } from '@/lib/shared/textMatch';

export const dynamic = 'force-dynamic';

/** A page's stored text items with boxes (for read aloud when the text was recognised on this Mac). */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const file = sp.get('file') ?? '';
  const page = Number(sp.get('page'));
  if (!file || !Number.isInteger(page) || page < 1) return apiError(400, 'VALIDATION_ERROR', 'Give a file and a page.');
  const row = getDb().select().from(bookTextPages).where(and(eq(bookTextPages.file, file), eq(bookTextPages.page, page))).get();
  if (!row) return NextResponse.json({ data: [] });
  const items = (JSON.parse(row.itemsJson) as PageItem[]).map(([s, l, x, y, w, h]) => ({ str: row.text.slice(s, s + l), rect: { x, y, w, h } }));
  return NextResponse.json({ data: items });
}
