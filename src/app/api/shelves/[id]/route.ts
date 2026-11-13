import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { deleteShelf } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!deleteShelf(id)) return apiError(404, 'NOT_FOUND', 'No such shelf.');
  return NextResponse.json({ data: { ok: true } });
}
