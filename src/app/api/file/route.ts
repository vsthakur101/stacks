import fs from 'node:fs';
import { Readable } from 'node:stream';
import { apiError, guard } from '@/lib/server/api';
import { parseRange } from '@/lib/server/library/range';
import { findLibraryFile } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain; charset=utf-8' };

/**
 * Streams a file from the download folder for the reader, with Range support so pdf.js can open a
 * large PDF by fetching only the pieces it needs. Only paths the Library scan found are served.
 */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const relative = new URL(req.url).searchParams.get('file') ?? '';
  const file = relative ? await findLibraryFile(getSettings().downloadRoot, relative) : null;
  const type = file ? TYPES[file.ext] : undefined;
  if (!file || !type) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');

  let size: number;
  try {
    size = (await fs.promises.stat(file.path)).size;
  } catch {
    return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder any more.');
  }
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = parseRange(req.headers.get('range'), size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const stream = Readable.toWeb(fs.createReadStream(file.path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
