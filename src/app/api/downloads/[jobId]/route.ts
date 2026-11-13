import { NextResponse } from 'next/server';
import { apiError, guard } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';

export const dynamic = 'force-dynamic';

/** Cancels every unfinished file in the job. */
export async function DELETE(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { jobId } = await ctx.params;
  const manager = getManager();
  if (!manager.getJob(jobId)) return apiError(404, 'NOT_FOUND', 'No such download.');
  manager.cancelJob(jobId);
  return NextResponse.json({ data: { ok: true } });
}
