import { guard } from '@/lib/server/api';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { listCollections } from '@/lib/server/library/collections';
import { buildLibrary } from '@/lib/server/library/view';
import { NAV_TYPE, navigationFeed, type NavLink } from '@/lib/server/opds';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/** OPDS start: ways into the Library for reading apps. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const lib = await buildLibrary(getSettings().downloadRoot, { sort: 'recent' });
  const links: NavLink[] = [
    { id: 'recent', title: 'Recently added', href: '/opds/recent', content: `${lib.totalItems} items, newest first` },
    { id: 'all', title: 'Everything, by title', href: '/opds/all' },
    ...lib.sections.map((s) => ({ id: `section-${s}`, title: SECTIONS[s].name, href: `/opds/section/${s}` })),
    ...listCollections().map((c) => ({ id: `collection-${c.id}`, title: c.name, href: `/opds/collection/${c.id}`, content: `Your collection, ${c.count} ${c.count === 1 ? 'item' : 'items'}` })),
  ];
  return new Response(navigationFeed(links), { headers: { 'Content-Type': `${NAV_TYPE}; charset=utf-8` } });
}
