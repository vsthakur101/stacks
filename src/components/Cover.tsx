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
 * A cover or first-page thumbnail. Without an image we print a cover the way Indian presses did:
 * an indigo field, an inset double frame, the title centred in the book face.
 */
export function Cover({ src, title, subtitle, shape = 'book', className, eager }: CoverProps) {
  const [failed, setFailed] = useState(!src);
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-indigo-deep shadow-[0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-10px_rgb(0_0_0/0.35)]',
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
        <div className="pothi-frame absolute inset-0 flex flex-col items-center justify-center gap-3 px-[16%] pt-[22%] pb-[14%] text-center">
          <span className="line-clamp-5 font-serif text-[clamp(0.85rem,1.25vw,1.1rem)] text-[#efe7d2]">{title}</span>
          <span aria-hidden className="h-px w-6 bg-[#c8901a]/70" />
          {subtitle ? <span className="line-clamp-2 text-[0.7rem] text-[#efe7d2]/70">{subtitle}</span> : null}
        </div>
      )}
    </div>
  );
}
