import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { createCollection, DuplicateNameError, listCollections, setMembership } from '@/lib/server/library/collections';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ data: listCollections() });
}

const schema = z.object({ name: z.string().trim().min(1).max(80), ref: z.string().regex(/^(item|file):.{1,1000}$/).optional() });

/** Creates a collection; with `ref`, puts that item or file in it straight away. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  try {
    const c = createCollection(body.data.name);
    if (body.data.ref) setMembership(c.id, body.data.ref, true);
    return NextResponse.json({ data: c }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateNameError) return apiError(409, 'DUPLICATE', error.message);
    throw error;
  }
}
