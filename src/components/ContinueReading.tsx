import Link from 'next/link';
import { archiveThumb } from '@/lib/server/catalog/normalize';
import { recentlyRead } from '@/lib/server/library/progress';
import { getSettings } from '@/lib/server/settings';
import { Cover } from './Cover';

/** Home's "Continue reading": the last files opened in the reader, each reopening where you stopped. */
export async function ContinueReading() {
  const items = await recentlyRead(getSettings().downloadRoot);
  if (items.length === 0) return null;
  return (
    <section className="t-section" aria-labelledby="continue-reading">
      <h2 id="continue-reading" className="font-display mb-6 text-2xl text-ink">
        Continue reading
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const isText = p.total === 1000 && p.file.endsWith('.txt');
          const fraction = isText ? (p.page - 1) / 999 : p.page / p.total;
          return (
            <li key={p.file}>
              <Link href={`/reader?file=${encodeURIComponent(p.file)}`} className="group flex items-center gap-4 rounded-md p-2 hover:bg-raised">
                <div className="w-14 shrink-0">
                  <Cover src={p.identifier ? archiveThumb(p.identifier) : undefined} title={p.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-title line-clamp-2 text-ink group-hover:text-accent">{p.title}</p>
                  <p className="mt-1 text-sm text-ink-soft tabular-nums">
                    {isText ? `${Math.round(fraction * 100)}% read` : `Page ${p.page} of ${p.total}`}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
                    <div className="h-full bg-accent" style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
