import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { jobId } = await ctx.params;
  const manager = getManager();
  if (!manager.getJob(jobId)) return apiError(404, 'NOT_FOUND', 'No such download.');
  manager.retryJob(jobId);
  return NextResponse.json({ data: { ok: true } });
}
