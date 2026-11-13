import Link from 'next/link';
import { formatDisplayDate } from '@/lib/server/catalog/normalize';
import type { ItemCard, SectionId } from '@/lib/shared/types';
import { SelectAllButton, SelectToggle } from './SelectToggle';
import { itemHref, itemToTray } from './Tiles';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A year of issues as a quiet ledger: month headings, one row per issue. Dailies stay scannable. */
export function IssueList({ items, section, publication }: { items: ItemCard[]; section: SectionId; publication: string }) {
  const byMonth = new Map<string, ItemCard[]>();
  for (const item of items) {
    const month = item.date && item.date.length >= 7 ? item.date.slice(0, 7) : 'unknown';
    byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
  }
  // Monthlies and quarterlies: a month heading over a single row is noise, so list them flat.
  if ([...byMonth.values()].every((issues) => issues.length <= 1)) {
    return <Rows issues={items} section={section} publication={publication} />;
  }
  return (
    <div className="space-y-12">
      {[...byMonth.entries()].map(([month, issues]) => {
        const label = month === 'unknown' ? 'Month not given' : MONTHS[Number(month.slice(5, 7)) - 1];
        const tray = issues.map((i) => itemToTray(i, section, publication));
        return (
          <section key={month}>
            <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
              <h3 className="font-serif text-xl text-ink">{label}</h3>
              {issues.length > 1 ? (
                <SelectAllButton
                  items={tray}
                  label={`all ${issues.length} from ${month === 'unknown' ? 'this group' : label}`}
                />
              ) : null}
            </div>
            <Rows issues={issues} section={section} publication={publication} />
          </section>
        );
      })}
    </div>
  );
}

function Rows({ issues, section, publication }: { issues: ItemCard[]; section: SectionId; publication: string }) {
  return (
    <ul>
      {issues.map((issue) => (
        <li key={issue.identifier} className="flex items-center gap-4 py-1.5">
          <SelectToggle item={itemToTray(issue, section, publication)} />
          <Link href={itemHref(issue.identifier, section, publication)} className="group flex min-w-0 flex-1 items-baseline gap-4">
            <span className="w-36 shrink-0 font-serif text-ink tabular-nums group-hover:text-accent">
              {formatDisplayDate(issue.date) ?? 'Undated'}
            </span>
            <span className="truncate text-sm text-ink-soft">{issue.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
