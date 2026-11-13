/** "4,202 scans  Also 153 catalogued books" on the left, page actions on the right. */
export function ResultsHeader({ title, other, actions }: { title: string; other?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <p className="text-ink">
        <span className="font-display text-xl">{title}</span>
        {other ? <span className="ml-3 text-sm">Also {other}</span> : null}
      </p>
      {actions ? <div className="flex flex-wrap items-center gap-6 text-sm">{actions}</div> : null}
    </div>
  );
}
