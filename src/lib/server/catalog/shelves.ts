import type { ItemCard, WorkCard } from '@/lib/shared/types';
import { searchArchive } from './archive';
import { searchWorks } from './openLibrary';
import { TTL } from '../http';

/** Home-page shelves. Curated 2026-11-13 — edit freely; each is one row of whatever fits. */
export type Shelf =
  | { kind: 'works'; title: string; query: string; more?: string }
  | { kind: 'items'; title: string; query: string; more?: string };

export const SHELVES: Shelf[] = [
  {
    kind: 'items',
    title: 'Sanskrit texts',
    query: 'mediatype:texts AND language:(san OR Sanskrit) AND NOT collection:(inlibrary OR printdisabled)',
  },
  {
    kind: 'items',
    title: 'From Geeta Press, Gorakhpur',
    query: 'mediatype:texts AND publisher:("gita press" OR "geeta press") AND NOT collection:(inlibrary OR printdisabled)',
    more: '/search?q=Gita%20Press',
  },
  { kind: 'works', title: 'Vedanta', query: 'subject_key:vedanta', more: '/subjects/vedanta' },
  { kind: 'works', title: 'Classics, free to read', query: 'subject_key:classic_literature', more: '/subjects/classic_literature' },
];

export type LoadedShelf =
  | { shelf: Shelf & { kind: 'works' }; results: WorkCard[] }
  | { shelf: Shelf & { kind: 'items' }; results: ItemCard[] };

export async function loadShelf(shelf: Shelf): Promise<LoadedShelf> {
  if (shelf.kind === 'works') {
    const page = await searchWorks({ query: shelf.query, pageSize: 10, sort: 'editions' });
    return { shelf, results: page.results };
  }
  const page = await searchArchive({ query: shelf.query, pageSize: 10, sort: ['downloads desc'], ttl: TTL.listing });
  return { shelf, results: page.results };
}
