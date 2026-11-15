import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { annotationsFor, createAnnotation } from '@/lib/server/library/annotations';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';
import { HIGHLIGHT_COLORS } from '@/lib/shared/annotations';

export const dynamic = 'force-dynamic';

const fraction = z.number().min(0).max(1);
const createSchema = z.object({
  file: z.string().min(1).max(1000),
  page: z.number().int().min(1).max(100_000),
  kind: z.enum(['highlight', 'note']),
  rect: z.object({ x: fraction, y: fraction, w: fraction, h: fraction }).optional(),
  color: z.enum(HIGHLIGHT_COLORS).optional(),
  note: z.string().max(10_000).optional(),
  text: z.string().max(4_000).optional(),
});

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const file = new URL(req.url).searchParams.get('file') ?? '';
  return NextResponse.json({ data: annotationsFor(file) });
}

/** Saves a highlight or page note. Only files the Library scan knows can be annotated. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, createSchema);
  if ('error' in body) return body.error;
  const root = getSettings().downloadRoot;
  if (!(await findLibraryFile(root, body.data.file))) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  if (body.data.kind === 'highlight' && !body.data.rect) return apiError(400, 'VALIDATION_ERROR', 'A highlight needs a box.');
  const { identifier } = await titleForFile(root, body.data.file);
  const a = createAnnotation({ ...body.data, identifier, color: body.data.kind === 'highlight' ? (body.data.color ?? 'yellow') : null });
  return NextResponse.json({ data: a }, { status: 201 });
}
