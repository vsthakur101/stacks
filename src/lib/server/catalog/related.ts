import { z } from 'zod';
import type { ItemCard } from '@/lib/shared/types';
import { getJson, TTL } from '../http';
import { archiveThumb } from './normalize';

/** "More like this": archive.org's related-items service (the same one under its item pages). */

const first = z.union([z.array(z.union([z.string(), z.number()])), z.string(), z.number()]).optional();
const schema = z.object({
  hits: z.object({
    hits: z.array(z.object({ _id: z.string(), _source: z.object({ title: first, creator: first, date: first, year: first, mediatype: first }).passthrough() })),
  }),
});

const one = (v: unknown): string | undefined => {
  const x = Array.isArray(v) ? v[0] : v;
  return x === undefined || x === null ? undefined : String(x);
};

export function parseRelated(raw: unknown, exclude: string): ItemCard[] {
  return schema
    .parse(raw)
    .hits.hits.filter((h) => h._id !== exclude && (one(h._source.mediatype) ?? 'texts') === 'texts')
    .map((h): ItemCard => {
      const date = one(h._source.date);
      const year = Number(one(h._source.year) ?? date?.slice(0, 4));
      return {
        identifier: h._id,
        title: one(h._source.title)?.trim() || h._id,
        isCollection: false,
        creator: one(h._source.creator),
        ...(Number.isInteger(year) && year > 0 && year < 3000 ? { year, date: String(year) } : {}),
        thumbnail: archiveThumb(h._id),
      };
    });
}

export async function relatedItems(identifier: string): Promise<ItemCard[]> {
  const url = `https://be-api.us.archive.org/mds/v1/get_related/all/${encodeURIComponent(identifier)}`;
  return (await getJson(url, TTL.listing, (raw) => parseRelated(raw, identifier), { timeoutMs: 10_000 })).data;
}
