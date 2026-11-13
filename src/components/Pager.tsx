import Link from 'next/link';

/** Numeric pager. Keeps every other query param. archive.org caps deep paging, so we stop at 400 pages. */
export function Pager({
  path,
  params,
  page,
  total,
  pageSize,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const last = Math.min(Math.ceil(total / pageSize), 400);
  if (last <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const pages = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);

  return (
    <nav aria-label="Pages" className="mt-14 flex flex-wrap items-center gap-1 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="mr-3 text-ink-soft hover:text-accent">
          Previous
        </Link>
      ) : null}
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - (sorted[i - 1] ?? p) > 1 ? <span className="px-1 text-ink-faint">…</span> : null}
          {p === page ? (
            <span aria-current="page" className="min-w-8 rounded-full bg-accent-wash px-2.5 py-1 text-center text-ink">
              {p}
            </span>
          ) : (
            <Link href={href(p)} className="min-w-8 rounded-full px-2.5 py-1 text-center text-ink-soft hover:text-accent">
              {p}
            </Link>
          )}
        </span>
      ))}
      {page < last ? (
        <Link href={href(page + 1)} className="ml-3 text-ink-soft hover:text-accent">
          Next
        </Link>
      ) : null}
    </nav>
  );
}
