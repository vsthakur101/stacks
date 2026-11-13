import type { Metadata } from 'next';
import { DownloadsView } from '@/components/DownloadsView';
import { PageHeading } from '@/components/States';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Downloads' };

export default function DownloadsPage() {
  const { downloadRoot } = getSettings();
  return (
    <>
      <PageHeading title="Downloads" lede={<>Saving to <span className="text-ink">{downloadRoot}</span></>} />
      <DownloadsView />
    </>
  );
}
