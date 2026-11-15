import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { setMembership } from '@/lib/server/library/collections';

export const dynamic = 'force-dynamic';

const schema = z.object({ ref: z.string().regex(/^(item|file):.{1,1000}$/), member: z.boolean() });

/** Puts an item or file in a collection, or takes it out. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  try {
    setMembership((await ctx.params).id, body.data.ref, body.data.member);
    return NextResponse.json({ data: { ok: true } });
  } catch {
    return apiError(404, 'NOT_FOUND', 'No such collection.');
  }
}
