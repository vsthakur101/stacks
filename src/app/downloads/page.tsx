import type { Metadata } from 'next';
import { DownloadsView } from '@/components/DownloadsView';
import { PageHeading } from '@/components/States';
import fs from 'node:fs/promises';
import { formatBytesServer } from '@/lib/format';
import { scanLibrary } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Downloads' };

export default async function DownloadsPage() {
  const { downloadRoot } = getSettings();
  // Disk use: what the download folder holds, and what's left on its disk.
  const [scan, stat] = await Promise.all([scanLibrary(downloadRoot).catch(() => null), fs.statfs(downloadRoot).catch(() => null)]);
  const used = scan ? scan.items.reduce((n, i) => n + i.bytes, 0) + scan.others.reduce((n, f) => n + f.size, 0) : null;
  const free = stat ? stat.bavail * stat.bsize : null;
  return (
    <>
      <PageHeading
        title="Downloads"
        lede={
          <>
            Saving to <span className="text-ink">{downloadRoot}</span>
            {used !== null ? `, which holds ${formatBytesServer(used)}` : ''}
            {free !== null ? `; ${formatBytesServer(free)} free on that disk` : ''}.
          </>
        }
      >
        {free !== null && free < 2 * 1024 ** 3 ? <p className="mt-2 text-danger">The disk is nearly full: large downloads may stop.</p> : null}
      </PageHeading>
      <DownloadsView />
    </>
  );
}
