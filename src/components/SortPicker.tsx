import { SORTS, type SortKey } from '@/lib/server/search/params';
import { Segmented } from './Segmented';

/** Best match / Most read / Oldest / Newest for archive.org results. */
export function SortPicker({ current, href }: { current?: SortKey; href: (sort?: SortKey) => string }) {
  return (
    <Segmented
      label="Order"
      options={[
        { label: 'Best match', href: href(undefined), current: !current },
        ...(Object.keys(SORTS) as SortKey[]).map((k) => ({ label: SORTS[k].label, href: href(k), current: current === k })),
      ]}
    />
  );
}
