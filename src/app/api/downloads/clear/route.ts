import { NextResponse } from 'next/server';
import { guard } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  getManager().clearFinished();
  return NextResponse.json({ data: { ok: true } });
}
