import { guard } from '@/lib/server/api';
import { isSafeIdentifier } from '@/lib/server/catalog/archive';
import { onlinePages, PAGE_WIDTHS, pageImage } from '@/lib/server/catalog/online';

export const dynamic = 'force-dynamic';

/** A scan page for the online reader: /page-image/<identifier>/<n>?w=1200 (cached; next pages fetched ahead). */
export async function GET(req: Request, ctx: { params: Promise<{ identifier: string; n: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { identifier, n } = await ctx.params;
  const asked = Number(new URL(req.url).searchParams.get('w'));
  const width = PAGE_WIDTHS.find((w) => w >= asked) ?? PAGE_WIDTHS.at(-1)!;
  if (!isSafeIdentifier(identifier)) return new Response('Not found', { status: 404 });
  let pages;
  try {
    pages = await onlinePages(identifier);
  } catch {
    return new Response('archive.org didn’t answer', { status: 502 });
  }
  const page = pages[Number(n) - 1];
  if (!page) return new Response('No such page', { status: 404 });
  try {
    const img = await pageImage(identifier, page, width);
    // Read ahead: the next two pages, in the background.
    for (const next of pages.slice(page.n, page.n + 2)) void pageImage(identifier, next, width).catch(() => undefined);
    return new Response(new Uint8Array(img), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=604800, immutable' } });
  } catch (error) {
    return new Response(`archive.org didn’t send this page (${error instanceof Error ? error.message : 'unknown error'})`, { status: 502 });
  }
}
