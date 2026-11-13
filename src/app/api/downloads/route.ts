import { NextResponse } from 'next/server';
import { guard, parseBody } from '@/lib/server/api';
import { getManager } from '@/lib/server/downloads/instance';
import { createDownloadSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const manager = getManager();
  return NextResponse.json({ data: { jobs: manager.listJobs(), queue: manager.queueStatus() } });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, createDownloadSchema);
  if ('error' in body) return body.error;
  const { items, format, fallback } = body.data;
  const jobId = getManager().createJob(items, format, fallback);
  return NextResponse.json({ data: { jobId } }, { status: 201 });
}
