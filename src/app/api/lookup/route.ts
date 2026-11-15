import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { cleanWord, lookupWord } from '@/lib/server/lookup/lookup';

export const dynamic = 'force-dynamic';

/** Word lookup: GET ?q=<word, Devanagari or Roman>. Monier-Williams (Sanskrit) and Wiktionary (Hindi). */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!cleanWord(q) || q.length > 80) return apiError(400, 'VALIDATION_ERROR', 'Type one word to look up.');
  return NextResponse.json({ data: await lookupWord(q) });
}
