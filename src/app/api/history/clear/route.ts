import { NextResponse } from 'next/server';
import { guard } from '@/lib/server/api';
import { clearSearchHistory } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  clearSearchHistory();
  return NextResponse.json({ data: { ok: true } });
}
