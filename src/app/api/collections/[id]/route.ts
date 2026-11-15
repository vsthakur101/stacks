import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { deleteCollection, DuplicateNameError, renameCollection } from '@/lib/server/library/collections';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));
  if ('error' in body) return body.error;
  try {
    return renameCollection((await ctx.params).id, body.data.name) ? NextResponse.json({ data: { ok: true } }) : apiError(404, 'NOT_FOUND', 'No such collection.');
  } catch (error) {
    if (error instanceof DuplicateNameError) return apiError(409, 'DUPLICATE', error.message);
    throw error;
  }
}

/** Deletes the collection only; the books stay in the Library. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  return deleteCollection((await ctx.params).id) ? NextResponse.json({ data: { ok: true } }) : apiError(404, 'NOT_FOUND', 'No such collection.');
}
