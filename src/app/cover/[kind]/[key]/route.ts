import { guard } from '@/lib/server/api';
import { getCover } from '@/lib/server/covers';

export const dynamic = 'force-dynamic';

const KEEP = 'public, max-age=2592000, stale-while-revalidate=604800';

/** Serves a cover from the local cache (see src/lib/server/covers.ts). */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; key: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { kind, key } = await ctx.params;
  try {
    const cover = await getCover(kind, decodeURIComponent(key));
    if (cover.kind === 'invalid') return new Response('Not a cover', { status: 400 });
    // The page shows its typographic cover on 404; let the browser remember that for a day.
    if (cover.kind === 'missing') return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=86400' } });
    return new Response(new Uint8Array(cover.body), {
      headers: { 'Content-Type': cover.type, 'Cache-Control': KEEP, 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    // Upstream trouble: don't cache, so the next view tries again.
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
