'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface CoverProps {
  src?: string;
  title: string;
  subtitle?: string;
  shape?: 'book' | 'page';
  className?: string;
  eager?: boolean;
}

/**
 * A cover or first-page thumbnail. When there's no image (or it fails / is archive.org's
 * "not found" placeholder), we set the title in type instead of showing a broken box.
 */
export function Cover({ src, title, subtitle, shape = 'book', className, eager }: CoverProps) {
  const [failed, setFailed] = useState(!src);
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-cover-fallback ring-1 ring-rule',
        shape === 'book' ? 'aspect-[2/3]' : 'aspect-[3/4]',
        className,
      )}
    >
      {!failed && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails, no optimization wanted
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // archive.org serves a 180×? "notfound.png" for items without a thumbnail.
            const img = e.currentTarget;
            if (img.currentSrc.includes('notfound')) setFailed(true);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-[9%]">
          <span className="line-clamp-5 font-serif text-[clamp(0.8rem,1.4vw,1.05rem)] leading-snug text-ink">{title}</span>
          {subtitle ? <span className="line-clamp-2 text-xs text-ink-soft">{subtitle}</span> : null}
        </div>
      )}
    </div>
  );
}
