'use client';

import { Check } from 'lucide-react';
import { useIsDownloaded } from '@/lib/client/downloaded';
import { cn } from '@/lib/cn';

/** A quiet tick on a cover when the item (or any scan of a book) is already in the download folder. */
export function DownloadedMark({ identifiers, className }: { identifiers: readonly string[]; className?: string }) {
  const downloaded = useIsDownloaded(identifiers);
  if (!downloaded) return null;
  return (
    <span
      title="Already downloaded"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-raised/95 py-0.5 pr-2 pl-1.5 text-xs text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]',
        className,
      )}
    >
      <Check className="size-3.5 text-accent" strokeWidth={2.5} />
      <span>Downloaded</span>
    </span>
  );
}
