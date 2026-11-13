/** While the reader prepares: an empty reading frame, not the catalogue's cover grid. */
export default function ReaderLoading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-raised" role="status">
      <span className="sr-only">Opening the reader</span>
      <div className="h-14 shrink-0 border-b border-rule bg-panel" />
      <div className="flex min-h-0 flex-1 items-start justify-center p-4">
        <div className="t-cover aspect-[3/4] h-full max-h-[85vh] bg-panel" />
      </div>
      <div className="h-14 shrink-0 border-t border-rule bg-panel" />
    </div>
  );
}
