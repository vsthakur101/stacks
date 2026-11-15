/** The page list comes from archive.org (a few seconds the first time). */
export default function Loading() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-raised" role="status">
      <p className="text-ink-soft">Getting this book’s pages from archive.org…</p>
    </div>
  );
}
