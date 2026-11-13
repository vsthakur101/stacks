import { SORTS, type SortKey } from '@/lib/server/search/params';
import { findLanguage, LANGUAGES, OTHER_LANGUAGE, OTHER_LANGUAGE_LABEL } from '@/lib/shared/languages';
import type { FilterMenuSpec } from './FilterBar';

/** Language menu: Any, every listed language (in its own script), and Other or unknown. */
export function languageMenu(current: string | undefined, href: (code?: string) => string): FilterMenuSpec {
  const selected = findLanguage(current);
  const value = current === OTHER_LANGUAGE ? OTHER_LANGUAGE_LABEL : selected ? selected.endonym : 'Any';
  return {
    label: 'Language',
    value,
    active: Boolean(current),
    columns: 2,
    options: [
      { key: 'any', label: 'Any language', href: href(undefined), current: !current },
      ...LANGUAGES.map((l) => ({
        key: l.code,
        label: <span lang={l.code === 'eng' ? 'en' : undefined}>{l.endonym}</span>,
        hint: l.endonym === l.name ? undefined : l.name,
        href: href(l.code),
        current: selected?.code === l.code,
      })),
      { key: OTHER_LANGUAGE, label: OTHER_LANGUAGE_LABEL, hint: 'No language recorded, or not listed', href: href(OTHER_LANGUAGE), current: current === OTHER_LANGUAGE },
    ],
  };
}

export function orderMenu(current: SortKey | undefined, href: (sort?: SortKey) => string): FilterMenuSpec {
  return {
    label: 'Order',
    value: current ? SORTS[current].label : 'Best match',
    active: Boolean(current),
    options: [
      { key: 'best', label: 'Best match', href: href(undefined), current: !current },
      ...(Object.keys(SORTS) as SortKey[]).map((k) => ({ key: k, label: SORTS[k].label, href: href(k), current: current === k })),
    ],
  };
}
