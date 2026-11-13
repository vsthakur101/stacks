import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cover } from '@/components/Cover';
import path from 'node:path';
import { FileActions } from '@/components/FileActions';
import { SelectToggle } from '@/components/SelectToggle';
import { StaleNotice, Unreachable } from '@/components/States';
import { formatBytesServer } from '@/lib/format';
import { getItem, isSafeIdentifier, ItemNotFoundError } from '@/lib/server/catalog/archive';
import { archiveThumb, formatDisplayDate, plainText } from '@/lib/server/catalog/normalize';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { sectionOf } from '@/lib/server/catalog/sectionOf';
import { availability } from '@/lib/server/downloads/formats';
import { getSettings } from '@/lib/server/settings';
import { filesFor } from '@/lib/server/downloads/library';
import { str, type SearchParams } from '@/lib/server/pageParams';
import { FORMAT_LABELS, isSectionId } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';
type Params = Promise<{ identifier: string }>;

async function load(identifier: string) {
  try {
    return await getItem(identifier);
  } catch (error) {
    if (error instanceof ItemNotFoundError) notFound();
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) return { title: 'Not found' };
  return { title: (await load(identifier))?.title ?? identifier };
}

export default async function ItemPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) notFound();
  const sp = await searchParams;
  const item = await load(identifier);
  if (!item) return <Unreachable what="this item" />;

  const sParam = str(sp.s);
  const section = isSectionId(sParam) ? sParam : sectionOf(item.collections);
  const publication = str(sp.p);
  const formats = [...availability(item.files).entries()];
  const onDisk = await filesFor(identifier);
  const root = getSettings().downloadRoot;
  // Our reader opens downloaded PDFs and text; otherwise Read uses archive.org's online viewer.
  const localRead = onDisk
    .filter((f) => f.startsWith(path.resolve(root) + path.sep))
    .map((f) => path.relative(path.resolve(root), f))
    .sort((a, b) => Number(b.endsWith('.pdf')) - Number(a.endsWith('.pdf')))
    .find((f) => f.endsWith('.pdf') || f.endsWith('.txt'));
  const readHref = localRead ? `/reader?file=${encodeURIComponent(localRead)}` : `/read/${identifier}`;
  const description = plainText(item.description);
  const details: [string, string | undefined][] = [
    ['Date', formatDisplayDate(item.date)],
    ['By', item.creator],
    ['Published by', item.publisher],
    ['Part of', publication],
    ['Language', item.language],
  ];

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <Link href={`/${section}`} className="hover:text-accent">
          {SECTIONS[section].name}
        </Link>
      </nav>
      <StaleNotice stale={item.stale} />
      <div className="grid gap-10 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-16">
        <div className="max-w-[300px]">
          <Cover src={archiveThumb(identifier)} title={item.title} shape="page" eager />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{item.title}</h1>

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
          </dl>

          {onDisk.length > 0 ? (
            <section className="mt-8 border-l-2 border-accent pl-4">
              <p className="mb-3 text-sm text-ink-soft">
                Already downloaded: <span className="text-ink">{onDisk.map((f) => f.split('/').pop()).join(', ')}</span>
              </p>
              <FileActions identifier={identifier} multiple={onDisk.length > 1} />
            </section>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {item.restricted ? (
              <>
                <p className="text-ink-soft">This is a borrow-only scan, so it can’t be downloaded.</p>
                <a
                  href={`https://archive.org/details/${identifier}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-ink/25 px-6 py-2.5 text-sm text-ink hover:border-accent hover:text-accent"
                >
                  Borrow on archive.org
                </a>
              </>
            ) : (
              <>
                <Link
                  href={readHref}
                  className={
                    onDisk.length > 0
                      ? 'rounded-full border border-ink/25 px-6 py-2.5 text-sm text-ink hover:border-accent hover:text-accent'
                      : 'rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90'
                  }
                >
                  Read
                </Link>
                <SelectToggle
                  item={{ identifier, title: item.title, section, publication, year: item.year, date: item.date, thumbnail: archiveThumb(identifier) }}
                  withLabel
                />
              </>
            )}
          </div>

          {!item.restricted && formats.length > 0 ? (
            <section className="mt-10 max-w-md">
              <h2 className="text-sm text-ink-faint">Available as</h2>
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {formats.map(([f, bytes]) => (
                  <li key={f} className="flex justify-between py-2 text-sm">
                    <span className="text-ink">{FORMAT_LABELS[f]}</span>
                    <span className="text-ink-soft tabular-nums">{bytes > 0 ? formatBytesServer(bytes) : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {description ? (
            <div className="prose-reading mt-10 text-ink">
              {[...new Set(description.split(/\n{2,}/).map((p) => p.trim()))]
                .slice(0, 12)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          ) : null}

          <p className="mt-10 text-sm">
            <a href={`https://archive.org/details/${identifier}`} target="_blank" rel="noreferrer" className="text-ink-faint hover:text-accent">
              View on archive.org
            </a>
          </p>
        </div>
      </div>
    </article>
  );
}
