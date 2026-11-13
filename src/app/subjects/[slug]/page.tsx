import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pager } from '@/components/Pager';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { TileGrid, WorkTile } from '@/components/Tiles';
import { searchWorks, subjectName } from '@/lib/server/catalog/openLibrary';
import { attempt, pageNum, type SearchParams } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: subjectName(decodeURIComponent((await params).slug)) };
}

export default async function SubjectPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const slug = decodeURIComponent((await params).slug).normalize('NFC');
  if (!/^[\p{L}\p{M}\p{N}_]{1,80}$/u.test(slug)) notFound();
  const page = pageNum((await searchParams).page);
  const works = await attempt(() => searchWorks({ query: `subject_key:${slug}`, page, sort: 'editions' }));

  return (
    <>
      <PageHeading title={subjectName(slug)} lede={works ? `${works.total.toLocaleString('en')} books free to read` : undefined} />
      {!works ? (
        <Unreachable what="this subject" />
      ) : works.results.length === 0 ? (
        <Empty title="No free books in this subject yet." />
      ) : (
        <>
          <StaleNotice stale={works.stale} />
          <TileGrid>
            {works.results.map((w) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
          <Pager path={`/subjects/${slug}`} params={{}} page={page} total={works.total} pageSize={works.pageSize} />
        </>
      )}
    </>
  );
}
