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
 * A cover or first-page thumbnail. Without an image, the theme prints a typographic cover:
 * title set large at the top, author at the foot, in the theme's fallback colours.
 */
export function Cover({ src, title, subtitle, shape = 'book', className, eager }: CoverProps) {
  const [failed, setFailed] = useState(!src);
  return (
    <div
      className={cn(
        't-cover relative overflow-hidden bg-raised',
        shape === 'book' ? 'aspect-[2/3]' : 'aspect-[3/4]',
        className,
      )}
    >
      {!failed && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails; no optimisation wanted
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // archive.org redirects missing thumbnails to a "notfound" placeholder.
            if (e.currentTarget.currentSrc.includes('notfound')) setFailed(true);
          }}
        />
      ) : (
        <div className="t-fallback absolute inset-0 flex flex-col justify-between p-[10%] pt-[24%]">
          <span className="font-display line-clamp-5 text-[clamp(1rem,1.6vw,1.35rem)] leading-tight">{title}</span>
          {subtitle ? <span className="line-clamp-2 text-xs opacity-85">{subtitle}</span> : null}
        </div>
      )}
    </div>
  );
}
