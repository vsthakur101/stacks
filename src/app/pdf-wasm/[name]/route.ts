import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * pdf.js's image decoders (JPEG 2000 for DLI scans, JBIG2 for black-and-white archive.org scans, colour
 * profiles), served from node_modules. Without them those pages render blank. Fixed list: no paths.
 */
const FILES: Record<string, string> = {
  'openjpeg.wasm': 'application/wasm',
  'openjpeg_nowasm_fallback.js': 'text/javascript; charset=utf-8',
  'jbig2.wasm': 'application/wasm',
  'jbig2_nowasm_fallback.js': 'text/javascript; charset=utf-8',
  'qcms_bg.wasm': 'application/wasm',
};

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const type = FILES[name];
  if (!type) return new Response('Not found', { status: 404 });
  const body = await fs.readFile(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'wasm', name));
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
}
