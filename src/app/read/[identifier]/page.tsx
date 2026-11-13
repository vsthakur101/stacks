import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReaderBar } from '@/components/ReaderBar';
import { getItem, isSafeIdentifier } from '@/lib/server/catalog/archive';
import { attempt } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';
type Params = Promise<{ identifier: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) return { title: 'Reader' };
  return { title: (await attempt(() => getItem(identifier)))?.title ?? 'Reader' };
}

/** Phase 1: archive.org's own reader, embedded edge to edge with our chrome reduced to back + title. */
export default async function ReadPage({ params }: { params: Params }) {
  const { identifier } = await params;
  if (!isSafeIdentifier(identifier)) notFound();
  const item = await attempt(() => getItem(identifier));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#101317]">
      <ReaderBar title={item?.title ?? identifier} identifier={identifier} />
      <iframe
        src={`https://archive.org/embed/${encodeURIComponent(identifier)}`}
        title={item?.title ?? 'Reader'}
        className="w-full flex-1 border-0"
        allow="fullscreen"
        allowFullScreen
      />
    </div>
  );
}
