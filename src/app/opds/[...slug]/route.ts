import { guard } from '@/lib/server/api';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { listCollections, membersOf } from '@/lib/server/library/collections';
import { buildLibrary, type LibraryFilters } from '@/lib/server/library/view';
import { ACQ_TYPE, acquisitionFeed, openSearchDescription } from '@/lib/server/opds';
import { getSettings } from '@/lib/server/settings';
import { isSectionId } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

const atom = (body: string) => new Response(body, { headers: { 'Content-Type': `${ACQ_TYPE}; charset=utf-8` } });
const MAX = 500;

/** OPDS acquisition feeds: recent, all, a section, a collection, search; plus the OpenSearch description. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const [kind, arg] = (await ctx.params).slug;
  if (kind === 'opensearch.xml') return new Response(openSearchDescription(), { headers: { 'Content-Type': 'application/opensearchdescription+xml; charset=utf-8' } });

  const root = getSettings().downloadRoot;
  const self = new URL(req.url).pathname + new URL(req.url).search;
  const filters: LibraryFilters = { sort: 'recent' };
  let title = 'Recently added';
  let withOthers = false;
  if (kind === 'all') {
    filters.sort = 'title';
    title = 'Everything, by title';
    withOthers = true;
  } else if (kind === 'section' && isSectionId(arg)) {
    filters.section = arg;
    title = SECTIONS[arg].name;
  } else if (kind === 'collection' && arg) {
    const c = listCollections().find((x) => x.id === arg);
    if (!c) return new Response('No such collection', { status: 404 });
    filters.members = membersOf(c.id);
    title = c.name;
    withOthers = true;
  } else if (kind === 'search') {
    const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 200);
    filters.q = q;
    title = q ? `Search: ${q}` : 'Search';
    withOthers = true;
  } else if (kind !== 'recent') {
    return new Response('Not found', { status: 404 });
  }
  const lib = await buildLibrary(root, filters);
  return atom(acquisitionFeed(`${kind}${arg ? `-${arg}` : ''}`, title, self, lib.entries.slice(0, MAX), withOthers ? lib.others.slice(0, MAX) : []));
}
