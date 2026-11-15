import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { markShelfSeen } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

/** "Mark as seen": what's new on this shelf is counted from now on. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  return markShelfSeen((await ctx.params).id) ? NextResponse.json({ data: { ok: true } }) : apiError(404, 'NOT_FOUND', 'No such shelf.');
}
