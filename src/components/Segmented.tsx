import Link from 'next/link';

export interface SegmentedOption {
  label: string;
  href: string;
  current: boolean;
}

/** A small set of mutually exclusive views. Plain links, so the choice lives in the URL and works without JS. */
export function Segmented({ label, options }: { label: string; options: SegmentedOption[] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-[1.25rem] border border-rule p-0.5 text-sm">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.current ? 'true' : undefined}
          className={
            o.current
              ? 'rounded-full bg-raised px-4 py-1.5 text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-rule'
              : 'rounded-full px-4 py-1.5 text-ink-soft hover:text-ink'
          }
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
