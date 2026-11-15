import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, PageHeading } from '@/components/States';
import { readingStats, type PeriodTotals, type ReadingStats } from '@/lib/server/library/stats';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reading' };

function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** Time read, pages, a calendar of reading days, most-read books and the Finished shelf. */
export default function ReadingPage() {
  const stats = readingStats();
  const anything = stats.year.seconds > 0 || stats.finished.length > 0;
  return (
    <>
      <PageHeading
        title="Reading"
        lede={stats.streak > 1 ? `${stats.streak} days in a row.` : 'Time is counted while a book is open in the reader and you’re reading.'}
      />
      {!anything ? (
        <Empty title="Nothing read yet.">
          <p>
            Open a book from your{' '}
            <Link href="/library" className="text-accent underline underline-offset-4">
              Library
            </Link>
            ; your reading time, pages and finished books appear here.
          </p>
        </Empty>
      ) : (
        <>
          <section aria-label="Totals" className="mb-14 grid gap-8 sm:grid-cols-3">
            <Period label="This week" t={stats.week} />
            <Period label="This month" t={stats.month} />
            <Period label="This year" t={stats.year} />
          </section>
          <Calendar daily={stats.daily} />
          <div className="mt-14 grid gap-14 lg:grid-cols-2">
            <section aria-labelledby="top-h">
              <h2 id="top-h" className="font-display mb-4 text-2xl text-ink">
                Most read this year
              </h2>
              {stats.topBooks.length ? (
                <ol className="divide-y divide-rule">
                  {stats.topBooks.map((b) => (
                    <li key={b.file} className="flex items-baseline justify-between gap-4 py-3">
                      <Link href={`/reader?${new URLSearchParams({ file: b.file })}`} className="font-title min-w-0 truncate text-lg text-ink hover:text-accent">
                        {b.title}
                      </Link>
                      <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                        {duration(b.seconds)}
                        {b.pages ? `, ${plural(b.pages, 'page', 'pages')}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-ink-soft">No reading time yet this year.</p>
              )}
            </section>
            <section aria-labelledby="fin-h">
              <h2 id="fin-h" className="font-display mb-4 text-2xl text-ink">
                Finished
              </h2>
              {stats.finished.length ? (
                <ol className="divide-y divide-rule">
                  {stats.finished.map((f) => (
                    <li key={f.file} className="flex items-baseline justify-between gap-4 py-3">
                      <Link href={`/reader?${new URLSearchParams({ file: f.file })}`} className="font-title min-w-0 truncate text-lg text-ink hover:text-accent">
                        {f.title}
                      </Link>
                      <span className="shrink-0 text-sm text-ink-soft">{new Date(f.finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-ink-soft">Books you read to the last page appear here.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Period({ label, t }: { label: string; t: PeriodTotals }) {
  return (
    <div>
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="font-display mt-1 text-4xl text-ink tabular-nums">{duration(t.seconds)}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {t.seconds || t.pages ? `${plural(t.pages, 'page', 'pages')} in ${plural(t.books, 'book', 'books')}, on ${plural(t.days, 'day', 'days')}` : 'Nothing yet'}
      </p>
    </div>
  );
}

/** Minutes → one of five steps of the theme's accent (one hue, light to dark). */
function level(seconds: number): number {
  const m = seconds / 60;
  if (m < 1) return 0;
  if (m < 10) return 1;
  if (m < 30) return 2;
  if (m < 60) return 3;
  return 4;
}
// Steps spread so the first is clearly apart from "none" in light and dark themes alike.
const LEVEL_BG = ['var(--rule)', 'color-mix(in srgb, var(--accent) 38%, var(--paper))', 'color-mix(in srgb, var(--accent) 58%, var(--paper))', 'color-mix(in srgb, var(--accent) 80%, var(--paper))', 'var(--accent)'];
const LEVEL_LABEL = ['none', 'under 10 minutes', '10–30 minutes', '30–60 minutes', 'an hour or more'];

function Calendar({ daily }: { daily: ReadingStats['daily'] }) {
  // Columns are weeks (Monday on top); pad the first week so weekdays line up.
  const first = new Date(`${daily[0]!.day}T12:00:00`);
  const pad = (first.getDay() + 6) % 7;
  const cells: (ReadingStats['daily'][number] | null)[] = [...Array<null>(pad).fill(null), ...daily];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const read = daily.filter((d) => d.seconds >= 60);
  return (
    <section aria-labelledby="cal-h">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="cal-h" className="font-display text-2xl text-ink">
          Last six months
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-ink-soft" aria-hidden>
          Less
          {LEVEL_BG.map((bg, i) => (
            <span key={i} className="keep-round inline-block size-3 rounded-[3px]" style={{ background: bg }} />
          ))}
          More
        </div>
      </div>
      <div className="overflow-x-auto pb-2" role="img" aria-label={`Reading on ${read.length} of the last ${daily.length} days`}>
        <div className="flex gap-[3px]">
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {w.map((d, j) =>
                d ? (
                  <span
                    key={j}
                    title={`${fmt(d.day)}: ${d.seconds >= 60 ? duration(d.seconds) : 'no reading'}${d.pages ? `, ${plural(d.pages, 'page', 'pages')}` : ''}`}
                    className="keep-round block size-3.5 rounded-[3px]"
                    style={{ background: LEVEL_BG[level(d.seconds)] }}
                  />
                ) : (
                  <span key={j} className="block size-3.5" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <details className="mt-3 text-sm text-ink-soft">
        <summary className="cursor-pointer hover:text-ink">Show as a list</summary>
        {read.length ? (
          <ul className="mt-2 columns-2 gap-8 sm:columns-3">
            {[...read].reverse().map((d) => (
              <li key={d.day} className="py-0.5">
                {fmt(d.day)}: {duration(d.seconds)} ({LEVEL_LABEL[level(d.seconds)]})
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">No reading days yet.</p>
        )}
      </details>
    </section>
  );
}
