import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { deleteAnnotation, updateAnnotation } from '@/lib/server/library/annotations';
import { HIGHLIGHT_COLORS } from '@/lib/shared/annotations';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ note: z.string().max(10_000).nullable().optional(), color: z.enum(HIGHLIGHT_COLORS).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, patchSchema);
  if ('error' in body) return body.error;
  const updated = updateAnnotation((await ctx.params).id, body.data);
  return updated ? NextResponse.json({ data: updated }) : apiError(404, 'NOT_FOUND', 'No such highlight or note.');
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  return deleteAnnotation((await ctx.params).id)
    ? NextResponse.json({ data: { ok: true } })
    : apiError(404, 'NOT_FOUND', 'No such highlight or note.');
}
