/** Pure helpers that turn archive.org's loosely-typed metadata into display values. */

/** archive.org returns many fields as either a scalar or an array. */
export function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return first(value[0]);
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}

export function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === 'string' ? [v] : []));
  if (typeof value === 'string') return [value];
  return [];
}

/** Drops the `fav-<username>` pseudo-collections that pollute item collection lists. */
export function realCollections(value: unknown): string[] {
  return asArray(value).filter((c) => !c.startsWith('fav-'));
}

/** Makes machine-ish titles readable: underscores → spaces, collapsed whitespace. */
export function cleanTitle(raw: string | undefined, fallback: string): string {
  if (!raw) return humanizeIdentifier(fallback);
  let title = raw.replace(/\s+/g, ' ').trim();
  if (!title.includes(' ') && title.includes('_')) title = title.replace(/_+/g, ' ');
  return title || humanizeIdentifier(fallback);
}

export function humanizeIdentifier(identifier: string): string {
  return identifier.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ParsedDate {
  iso?: string; // YYYY, YYYY-MM or YYYY-MM-DD
  year?: number;
  month?: number;
  day?: number;
}

/** Parses archive.org `date` values: "1923", "1923-04", "1923-04-07", "1923-04-07T00:00:00Z", "[1923]", "c1923". */
export function parseDate(raw: unknown, yearField?: unknown): ParsedDate {
  const text = first(raw);
  const m = text?.match(/(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (m) {
    const year = Number(m[1]);
    const month = m[2] ? Number(m[2]) : undefined;
    const day = m[3] ? Number(m[3]) : undefined;
    if (year > 0 && year <= 2100 && (!month || (month >= 1 && month <= 12))) {
      const iso = [m[1], m[2], m[3]].filter(Boolean).join('-');
      return { iso, year, month, day };
    }
  }
  const y = Number(first(yearField));
  if (Number.isInteger(y) && y > 0 && y <= 2100) return { iso: String(y), year: y };
  return {};
}

export function formatDisplayDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return undefined;
  if (!m) return String(y);
  const date = new Date(Date.UTC(y, m - 1, d ?? 1));
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    ...(d ? { day: 'numeric' } : {}),
  });
}

/** Open Library and archive.org descriptions come as strings, {value}, or arrays; may contain HTML. */
export function plainText(value: unknown): string | undefined {
  let text: string | undefined;
  if (typeof value === 'string') text = value;
  else if (Array.isArray(value)) text = value.filter((v) => typeof v === 'string').join('\n\n');
  else if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string') text = value.value;
  if (!text) return undefined;
  return (
    text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim() || undefined
  );
}

/** Escapes Lucene query syntax so user text is searched literally (word-wise). */
export function escapeLucene(input: string): string {
  return input
    .trim()
    .replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, (c) => `\\${c}`)
    .replace(/\s+/g, ' ');
}

export function archiveThumb(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

export function olCover(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'M'): string | undefined {
  return coverId && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : undefined;
}
