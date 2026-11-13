import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-prose py-16">
      <h1 className="font-display text-3xl text-ink">This page isn’t in the stacks.</h1>
      <p className="mt-3 text-ink-soft">
        The link may be mistyped, or the item may have been removed from the archive.{' '}
        <Link href="/" className="text-accent underline underline-offset-4">
          Start a new search
        </Link>
        .
      </p>
    </div>
  );
}
