import { z } from 'zod';
import { findLanguage, LANGUAGES, OTHER_LANGUAGE } from '@/lib/shared/languages';
import type { EbookAccess, Page, WorkCard } from '@/lib/shared/types';
import { getJson, TTL } from '../http';
import { olCover, plainText } from './normalize';

const BASE = 'https://openlibrary.org';
const SEARCH_FIELDS = 'key,title,author_name,author_key,first_publish_year,cover_i,ebook_access,ia';

const docSchema = z.looseObject({
  key: z.string(),
  title: z.string().optional(),
  author_name: z.array(z.string()).optional(),
  author_key: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
  ebook_access: z.string().optional(),
  ia: z.array(z.string()).optional(),
});
const searchSchema = z.looseObject({ numFound: z.number(), docs: z.array(docSchema) });

const ACCESS: readonly EbookAccess[] = ['public', 'borrowable', 'printdisabled', 'no_ebook'];

function toWorkCard(doc: z.infer<typeof docSchema>): WorkCard {
  const names = doc.author_name ?? [];
  const keys = doc.author_key ?? [];
  return {
    workId: doc.key.replace('/works/', ''),
    title: doc.title?.trim() || 'Untitled',
    authors: names.map((name, i) => ({ name, id: keys[i] ?? '' })).filter((a) => a.id),
    year: doc.first_publish_year,
    cover: olCover(doc.cover_i),
    access: (ACCESS as readonly string[]).includes(doc.ebook_access ?? '')
      ? (doc.ebook_access as EbookAccess)
      : 'no_ebook',
    scanIds: doc.ia ?? [],
  };
}

export interface WorkSearchOptions {
  /** Raw OL query clause (user text, or e.g. `author_key:OL21594A`). */
  query: string;
  page?: number;
  pageSize?: number;
  includeBorrowable?: boolean;
  sort?: 'editions' | 'new' | 'old';
  /** A code from LANGUAGES; unknown codes are ignored. */
  language?: string;
}

export async function searchWorks(opts: WorkSearchOptions): Promise<Page<WorkCard>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 24;
  const access = opts.includeBorrowable ? 'has_fulltext:true' : 'ebook_access:public';
  const params = new URLSearchParams({
    q: `${opts.query} ${access}${olLanguageClause(opts.language)}`.trim(),
    fields: SEARCH_FIELDS,
    page: String(page),
    limit: String(pageSize),
  });
  if (opts.sort) params.set('sort', opts.sort);
  const { data, stale } = await getJson(`${BASE}/search.json?${params}`, TTL.search, (raw) => searchSchema.parse(raw));
  return { total: data.numFound, page, pageSize, stale, results: data.docs.map(toWorkCard) };
}

/** OL language filter: a listed code, or for OTHER_LANGUAGE, none of the listed codes (includes untagged works). */
export function olLanguageClause(code: string | undefined): string {
  if (code === OTHER_LANGUAGE) return ` -language:(${LANGUAGES.map((l) => l.code).join(' OR ')})`;
  const lang = findLanguage(code);
  return lang ? ` language:${lang.code}` : '';
}

/**
 * Sanitizes user text for OL's Solr: keep words, drop syntax.
 * \p{M} matters: Devanagari vowel signs and viramas are combining marks (गीता = ग + ी + त + ा).
 */
export function olText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOlId(id: string, kind: 'W' | 'A'): boolean {
  return new RegExp(`^OL\\d{1,10}${kind}$`).test(id);
}

/* ---------------------------- work detail ---------------------------- */

const workSchema = z.looseObject({
  title: z.string().optional(),
  description: z.unknown().optional(),
  subjects: z.array(z.string()).optional(),
  covers: z.array(z.number()).optional(),
  first_publish_date: z.string().optional(),
});

export interface WorkDetail extends WorkCard {
  description?: string;
  subjects: string[];
  coverLarge?: string;
}

export async function getWork(workId: string): Promise<(WorkDetail & { stale: boolean }) | null> {
  if (!isOlId(workId, 'W')) return null;
  const [work, card] = await Promise.all([
    getJson(`${BASE}/works/${workId}.json`, TTL.metadata, (raw) => workSchema.parse(raw)),
    searchWorks({ query: `key:/works/${workId}`, pageSize: 1, includeBorrowable: true }).catch(() => null),
  ]);
  const base = card?.results[0];
  const coverId = work.data.covers?.find((c) => c > 0);
  return {
    workId,
    title: work.data.title ?? base?.title ?? 'Untitled',
    authors: base?.authors ?? [],
    year: base?.year,
    cover: base?.cover ?? olCover(coverId),
    coverLarge: olCover(coverId, 'L') ?? base?.cover,
    access: base?.access ?? 'no_ebook',
    scanIds: base?.scanIds ?? [],
    description: plainText(work.data.description),
    subjects: (work.data.subjects ?? []).slice(0, 12),
    stale: work.stale,
  };
}

/* ---------------------------- authors ---------------------------- */

const authorSchema = z.looseObject({
  name: z.string().optional(),
  personal_name: z.string().optional(),
  bio: z.unknown().optional(),
  birth_date: z.string().optional(),
  death_date: z.string().optional(),
  photos: z.array(z.number()).optional(),
});

export interface AuthorDetail {
  id: string;
  name: string;
  bio?: string;
  lifespan?: string;
  photo?: string;
}

export async function getAuthor(authorId: string): Promise<AuthorDetail | null> {
  if (!isOlId(authorId, 'A')) return null;
  const { data } = await getJson(`${BASE}/authors/${authorId}.json`, TTL.listing, (raw) => authorSchema.parse(raw));
  const photoId = data.photos?.find((p) => p > 0);
  const lifespan = data.birth_date || data.death_date ? `${data.birth_date ?? ''} – ${data.death_date ?? ''}`.trim() : undefined;
  return {
    id: authorId,
    name: data.name ?? data.personal_name ?? 'Unknown author',
    bio: plainText(data.bio),
    lifespan,
    photo: photoId ? `/cover/ola/${photoId}-M` : undefined,
  };
}

/** Subject slugs as Open Library uses them: lowercase, underscores. */
export function subjectSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // drop Latin accents only; Indic marks are part of the word
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

export function subjectName(slug: string): string {
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
