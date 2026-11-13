import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { bestFreeScan } from '@/lib/server/catalog/archive';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ scanIds: z.array(z.string()).min(1).max(300) });

/** Picks the default free scan for an Open Library work (design §6). */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;
  try {
    const identifier = await bestFreeScan(body.data.scanIds);
    if (!identifier) return apiError(404, 'NO_FREE_SCAN', 'This book has no free scan to download.');
    return NextResponse.json({ data: { identifier } });
  } catch {
    return apiError(502, 'UPSTREAM_ERROR', 'Could not reach archive.org.');
  }
}
