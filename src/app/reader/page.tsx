import type { Metadata } from 'next';
import fs from 'node:fs/promises';
import { notFound } from 'next/navigation';
import { PdfReader } from '@/components/reader/PdfReader';
import { TextReader } from '@/components/reader/TextReader';
import { peekItem } from '@/lib/server/catalog/archive';
import { nextVolumeFile } from '@/lib/server/library/nextVolume';
import { getProgress } from '@/lib/server/library/progress';
import { findLibraryFile, itemForFile, titleFromFileName } from '@/lib/server/library/scan';
import { str, type SearchParams } from '@/lib/server/pageParams';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reader' };

const TEXT_LIMIT = 4 * 1024 * 1024;

/** Reads a file from the download folder: PDFs on pdf.js, plain text as reading text. */
export default async function ReaderPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const relative = str(sp.file);
  const askedPage = Number(str(sp.page));
  const find = str(sp.find)?.slice(0, 200);
  const root = getSettings().downloadRoot;
  const file = relative ? await findLibraryFile(root, relative) : null;
  if (!file || (file.ext !== 'pdf' && file.ext !== 'txt')) notFound();

  const item = await itemForFile(root, file.relative);
  const title = (item && peekItem(item.identifier)?.title) ?? titleFromFileName(file.name);
  const progress = getProgress(file.relative);
  const backHref = '/library';
  const nextVol = item ? await nextVolumeFile(root, item.identifier) : null;
  const next = nextVol ? { href: `/reader?file=${encodeURIComponent(nextVol.relative)}`, label: nextVol.label } : undefined;

  if (file.ext === 'pdf') {
    const start = Number.isInteger(askedPage) && askedPage >= 1 ? askedPage : (progress?.page ?? 1);
    return <PdfReader file={file.relative} title={title} backHref={backHref} initialPage={start} next={next} initialFind={find} />;
  }

  const handle = await fs.open(file.path, 'r');
  const size = Math.min(file.size, TEXT_LIMIT);
  const buf = Buffer.alloc(size);
  await handle.read(buf, 0, size, 0);
  await handle.close();
  return (
    <TextReader
      file={file.relative}
      title={title}
      backHref={backHref}
      // archive.org's recognised text puts blank lines between most lines; keep paragraph breaks only.
      text={buf.toString('utf8').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n')}
      truncated={file.size > TEXT_LIMIT}
      initialPermille={progress?.page ?? 1}
      next={next}
    />
  );
}
