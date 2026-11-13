'use client';

import { useEffect, useRef } from 'react';
import { ReaderBar, useSaveProgress } from './ReaderChrome';

/** Plain-text files (archive.org's recognised text) as reading text; remembers the scroll position. */
export function TextReader({
  file,
  title,
  backHref,
  text,
  truncated,
  initialPermille,
}: {
  file: string;
  title: string;
  backHref: string;
  text: string;
  truncated: boolean;
  initialPermille: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const save = useSaveProgress(file);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = ((initialPermille - 1) / 999) * (el.scrollHeight - el.clientHeight);
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      save(max > 0 ? Math.round((el.scrollTop / max) * 999) + 1 : 1, 1000);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [initialPermille, save]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <ReaderBar title={title} backHref={backHref} />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-10">
        <article className="prose-reading mx-auto whitespace-pre-wrap text-ink">{text}</article>
        {truncated ? (
          <p className="mx-auto mt-10 max-w-prose text-sm text-ink-soft">
            This file is very long; Stacks shows the first part. Use Open in the Library to read all of it.
          </p>
        ) : null}
      </div>
    </div>
  );
}
