import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cover } from '@/components/Cover';
import { WorkSelectToggle } from '@/components/SelectToggle';
import { StaleNotice, Unreachable } from '@/components/States';
import { bestFreeScan } from '@/lib/server/catalog/archive';
import { getWork, isOlId, subjectSlug } from '@/lib/server/catalog/openLibrary';
import { attempt } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';

type Params = Promise<{ workId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { workId } = await params;
  const work = await attempt(() => getWork(workId));
  return { title: work?.title ?? 'Book' };
}

export default async function WorkPage({ params }: { params: Params }) {
  const { workId } = await params;
  if (!isOlId(workId, 'W')) notFound();
  const work = await attempt(() => getWork(workId));
  if (work === null) return <Unreachable what="this book" />;
  if (!work) notFound();

  const free = work.access === 'public';
  const scan = free ? await attempt(() => bestFreeScan(work.scanIds)) : null;

  return (
    <article>
      <StaleNotice stale={work.stale} />
      <div className="grid gap-10 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-16">
        <div className="max-w-[280px]">
          <Cover src={work.coverLarge ?? work.cover} title={work.title} eager />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{work.title}</h1>
          <p className="mt-3 text-lg text-ink-soft">
            {work.authors.length > 0
              ? work.authors.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/authors/${a.id}`} className="text-ink underline-offset-4 hover:text-accent hover:underline">
                      {a.name}
                    </Link>
                  </span>
                ))
              : 'Unknown author'}
            {work.year ? <span>, first published {work.year}</span> : null}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {free && scan ? (
              <>
                <Link
                  href={`/read/${scan}`}
                  className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
                >
                  Read
                </Link>
                <WorkSelectToggle scanIds={work.scanIds} base={{ title: work.title, year: work.year, thumbnail: work.cover }} withLabel />
              </>
            ) : (
              <a
                href={`https://openlibrary.org/works/${work.workId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ink/25 px-6 py-2.5 text-sm text-ink hover:border-accent hover:text-accent"
              >
                Borrow on Open Library
              </a>
            )}
          </div>

          {work.description ? (
            <div className="prose-reading mt-10 text-ink">
              {work.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}

          {work.subjects.length > 0 ? (
            <div className="mt-10">
              <h2 className="text-sm text-ink-faint">Subjects</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {work.subjects.map((s) => (
                  <li key={s}>
                    <Link
                      href={`/subjects/${subjectSlug(s)}`}
                      className="inline-block rounded-full border border-rule px-3 py-1 text-sm text-ink-soft hover:border-accent hover:text-accent"
                    >
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {free && work.scanIds.length > 1 ? (
            <details className="mt-10 text-sm">
              <summary className="cursor-pointer text-ink-soft hover:text-ink">
                Other scans of this book ({work.scanIds.length})
              </summary>
              <ul className="mt-3 columns-1 gap-8 sm:columns-2">
                {work.scanIds.slice(0, 60).map((id) => (
                  <li key={id} className="break-inside-avoid py-1">
                    <Link href={`/item/${id}?s=books`} className="text-ink-soft hover:text-accent">
                      {id}
                    </Link>
                    {id === scan ? <span className="ml-2 text-ink-faint">(default)</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}
