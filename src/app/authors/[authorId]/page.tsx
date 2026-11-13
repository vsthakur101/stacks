import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pager } from '@/components/Pager';
import { Empty, Unreachable } from '@/components/States';
import { TileGrid, WorkTile } from '@/components/Tiles';
import { getAuthor, isOlId, searchWorks } from '@/lib/server/catalog/openLibrary';
import { attempt, pageNum, type SearchParams } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';
type Params = Promise<{ authorId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { authorId } = await params;
  return { title: (await attempt(() => getAuthor(authorId)))?.name ?? 'Author' };
}

export default async function AuthorPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { authorId } = await params;
  if (!isOlId(authorId, 'A')) notFound();
  const page = pageNum((await searchParams).page);
  const [author, works] = await Promise.all([
    attempt(() => getAuthor(authorId)),
    attempt(() => searchWorks({ query: `author_key:${authorId}`, page, sort: 'editions' })),
  ]);
  if (!author) return <Unreachable what="this author" />;

  return (
    <>
      <header className="mb-14 grid max-w-4xl gap-8 sm:grid-cols-[140px_1fr]">
        {author.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={author.photo} alt="" className="aspect-[3/4] w-[140px] object-cover ring-1 ring-rule" />
        ) : null}
        <div className={author.photo ? '' : 'sm:col-span-2'}>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">{author.name}</h1>
          {author.lifespan ? <p className="mt-2 text-ink-soft">{author.lifespan}</p> : null}
          {author.bio ? <p className="prose-reading mt-5 line-clamp-[8] text-ink">{author.bio}</p> : null}
        </div>
      </header>

      {!works ? (
        <Unreachable what="their books" />
      ) : works.results.length === 0 ? (
        <Empty title="None of their books are free to read yet." />
      ) : (
        <>
          <h2 className="mb-8 font-display text-2xl text-ink">
            {works.total.toLocaleString('en')} {works.total === 1 ? 'book' : 'books'} free to read
          </h2>
          <TileGrid>
            {works.results.map((w) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
          <Pager path={`/authors/${authorId}`} params={{}} page={page} total={works.total} pageSize={works.pageSize} />
        </>
      )}
    </>
  );
}
