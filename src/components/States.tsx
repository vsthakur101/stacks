import Link from 'next/link';

export function StaleNotice({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <p role="status" className="mb-6 border-l-2 border-ink-faint pl-3 text-sm text-ink-soft">
      archive.org isn’t answering right now, so these are saved results from an earlier visit.
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-prose py-16">
      <p className="font-serif text-xl text-ink">{title}</p>
      {children ? <div className="mt-2 text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function Unreachable({ what }: { what: string }) {
  return (
    <Empty title={`Couldn’t load ${what}.`}>
      <p>
        archive.org or Open Library didn’t respond and there’s no saved copy yet. Check your connection and{' '}
        <Link href="" className="text-accent underline underline-offset-4">
          reload the page
        </Link>
        .
      </p>
    </Empty>
  );
}

export function PageHeading({ title, lede, children }: { title: string; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-10 max-w-3xl">
      <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      {lede ? <p className="mt-3 text-lg text-ink-soft">{lede}</p> : null}
      {children}
    </header>
  );
}
