'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef } from 'react';
import type { Rect } from '@/lib/shared/annotations';

/**
 * pdf.js's selectable text over the scanned page: invisible spans placed where the PDF's recognised
 * text sits, so a word can be double-clicked (lookup) or selected. Only as good as the scan's OCR.
 */
export function TextLayer({ doc, page, scale }: { doc: PDFDocumentProxy; page: number; scale: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !scale) return;
    let cancelled = false;
    let layer: { cancel: () => void } | null = null;
    el.replaceChildren();
    (async () => {
      const [pdfjs, pdfPage] = await Promise.all([import('pdfjs-dist'), doc.getPage(page)]);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      // The variables pdf.js's text layer sizes itself and its spans with.
      el.style.setProperty('--total-scale-factor', String(scale));
      el.style.setProperty('--scale-round-x', '1px');
      el.style.setProperty('--scale-round-y', '1px');
      const textLayer = new pdfjs.TextLayer({ textContentSource: pdfPage.streamTextContent({ includeMarkedContent: true }), container: el, viewport });
      layer = textLayer;
      await textLayer.render().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      layer?.cancel();
    };
  }, [doc, page, scale]);

  return <div ref={ref} className="textLayer" lang="und" />;
}

/** Find matches outlined on the page; the current one stronger. */
export function FindMarks({ rects }: { rects: { rect: Rect; current: boolean }[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {rects.map(({ rect, current: isCurrent }, i) => (
        <div
          key={i}
          data-current={isCurrent || undefined}
          className={isCurrent ? 'find-mark find-mark-current absolute rounded-[2px]' : 'find-mark absolute rounded-[2px]'}
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
        />
      ))}
    </div>
  );
}
