import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Plain GET form: works without JS and keeps the query in the URL. */
export function SearchBox({
  action,
  placeholder,
  defaultValue,
  size = 'md',
  hidden,
  autoFocus,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  size?: 'md' | 'lg';
  hidden?: Record<string, string>;
  autoFocus?: boolean;
}) {
  return (
    <form action={action} role="search" className="relative w-full">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="sr-only" htmlFor={`q-${action}`}>
        {placeholder}
      </label>
      <input
        id={`q-${action}`}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={cn(
          'w-full border-b-2 border-ink/80 bg-transparent pr-12 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none',
          size === 'lg' ? 'py-3 font-display text-2xl sm:text-3xl' : 'py-2 text-lg',
        )}
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute top-1/2 right-0 -translate-y-1/2 p-2 text-ink-soft hover:text-accent"
      >
        <Search className={size === 'lg' ? 'size-6' : 'size-5'} />
      </button>
    </form>
  );
}
