import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { cancelOcr, ocrAvailable, ocrState, startOcr, textSource } from '@/lib/server/library/ocr';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

async function pdf(relative: string) {
  const file = await findLibraryFile(getSettings().downloadRoot, relative);
  return file && file.ext === 'pdf' ? file : null;
}

/** Text recognition status for a PDF: GET ?file=. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const file = await pdf(new URL(req.url).searchParams.get('file') ?? '');
  if (!file) return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  return NextResponse.json({ data: { available: await ocrAvailable(), state: ocrState(file.relative), source: textSource(file.relative) } });
}

const schema = z.object({ file: z.string().min(1).max(1000) });

/** Starts recognising a PDF's text on this Mac (queued, one book at a time). */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  const file = await pdf(body.data.file);
  if (!file) return apiError(404, 'NOT_FOUND', 'That PDF isn’t in your download folder.');
  if (!(await ocrAvailable())) return apiError(501, 'UNAVAILABLE', 'Text recognition needs a Mac with Apple’s Command Line Tools.');
  return NextResponse.json({ data: { state: startOcr(file.path, file.relative) } });
}

export async function DELETE(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  return NextResponse.json({ data: { stopped: cancelOcr(body.data.file) } });
}
