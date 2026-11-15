import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OnlineReader } from '@/components/reader/OnlineReader';
import { getItem, isSafeIdentifier } from '@/lib/server/catalog/archive';
import { onlinePages } from '@/lib/server/catalog/online';
import { attempt } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';
type Params = Promise<{ identifier: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) return { title: 'Reader' };
  return { title: (await attempt(() => getItem(identifier)))?.title ?? 'Reader' };
}

/**
 * Reading a scan you haven't downloaded: its pages from archive.org in Stacks' own reader, cached
 * locally. When archive.org has no page images for it, archive.org's own viewer is offered instead.
 */
export default async function ReadPage({ params }: { params: Params }) {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) notFound();
  const [item, pages] = await Promise.all([attempt(() => getItem(identifier)), attempt(() => onlinePages(identifier))]);
  const title = item?.title ?? identifier;
  const back = `/item/${encodeURIComponent(identifier)}`;
  if (!pages?.length) {
    return (
      <div className="mx-auto max-w-prose px-6 py-16">
        <p className="font-display text-2xl text-ink">This item has no pages to show here.</p>
        <p className="mt-2 text-ink-soft">
          archive.org doesn’t offer page images for it (or didn’t answer).{' '}
          <a href={`https://archive.org/details/${encodeURIComponent(identifier)}`} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            Open it on archive.org
          </a>{' '}
          or{' '}
          <Link href={back} className="text-accent underline underline-offset-4">
            go back
          </Link>
          .
        </p>
      </div>
    );
  }
  return <OnlineReader identifier={identifier} title={title} pages={pages.map(({ n, label, width, height }) => ({ n, label, width, height }))} backHref={back} />;
}
