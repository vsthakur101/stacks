import fs from 'node:fs/promises';
import path from 'node:path';

/** pdf.js's background worker, served from node_modules so it always matches the installed version. */
export async function GET() {
  const file = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
  const body = await fs.readFile(file);
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
