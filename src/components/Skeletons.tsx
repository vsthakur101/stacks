import { cn } from '@/lib/cn';

/**
 * Quiet placeholders shown while results stream in. Static blocks in the cover colour, no shimmer:
 * the page should feel like it's arriving, not performing.
 */
export function TilesSkeleton({ count = 12, shape = 'book', shelf }: { count?: number; shape?: 'book' | 'page'; shelf?: boolean }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading results</span>
      <ul
        aria-hidden
        className={cn(
          'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-10 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]',
          shelf && 'shelf',
        )}
      >
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <div className={cn('t-cover bg-ink/8', shape === 'book' ? 'aspect-[2/3]' : 'aspect-[3/4]')} />
            <div className="mt-3.5 h-4 w-4/5 bg-ink/8" />
            <div className="mt-2 h-3 w-1/2 bg-ink/6" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SectionSkeleton({ title, count = 6 }: { title?: string; count?: number }) {
  return (
    <section className="t-section">
      <div className="mb-8 h-8">{title ? <h2 className="font-display text-2xl text-ink-faint">{title}</h2> : <div className="h-7 w-48 bg-ink/8" />}</div>
      <TilesSkeleton count={count} shelf />
    </section>
  );
}

export function LineSkeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-4 bg-ink/8', className)} />;
}
