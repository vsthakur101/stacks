import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { CollectionMenu, CollectionTools, type CollectionOption } from '@/components/CollectionMenu';
import { Cover } from '@/components/Cover';
import { FileButtons } from '@/components/FileButtons';
import { FilterBar, type FilterMenuSpec } from '@/components/FilterBar';
import { languageMenu } from '@/components/filterMenus';
import { SearchBox } from '@/components/SearchBox';
import { Empty, PageHeading } from '@/components/States';
import { itemHref, TileGrid } from '@/components/Tiles';
import { formatBytesServer } from '@/lib/format';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { fileRef, itemRef, listCollections, membersOf, membershipFor } from '@/lib/server/library/collections';
import { buildLibrary, LIBRARY_SORTS, type LibraryEntry, type LibrarySort } from '@/lib/server/library/view';
import { str, type SearchParams } from '@/lib/server/pageParams';
import { hrefWith } from '@/lib/server/search/params';
import { getSettings } from '@/lib/server/settings';
import { parseLanguageFilter } from '@/lib/shared/languages';
import { isSectionId, SECTION_IDS } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My library' };

/**
 * Everything in the download folder. Built from the folder itself (see library/scan.ts), so it
 * survives clearing download history; details come from cache only, so it always loads at once.
 */
export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const sectionParam = str(sp.section);
  const section = isSectionId(sectionParam) ? sectionParam : undefined;
  const lang = parseLanguageFilter(str(sp.lang));
  const sortParam = str(sp.sort);
  const sort: LibrarySort = sortParam && sortParam in LIBRARY_SORTS ? (sortParam as LibrarySort) : 'recent';
  const root = getSettings().downloadRoot;
  const allCollections = listCollections();
  const collection = allCollections.find((c) => c.id === str(sp.c));
  const lib = await buildLibrary(root, { q, section, lang, sort, members: collection ? membersOf(collection.id) : undefined });
  const options: CollectionOption[] = allCollections.map((c) => ({ id: c.id, name: c.name }));
  const membership = membershipFor([...lib.entries.map((e) => itemRef(e.identifier)), ...lib.others.map((f) => fileRef(f.relative))]);
  const view = (changes: Record<string, string | undefined>) => hrefWith('/library', sp, changes);

  if (lib.totalItems === 0 && lib.others.length === 0 && !q && !collection) {
    return (
      <>
        <PageHeading title="My library" />
        <Empty title="Nothing downloaded yet.">
          <p>
            Select items with the + on any cover, then choose Review and download. Everything you download appears here,
            even after you clear the Downloads list.
          </p>
        </Empty>
      </>
    );
  }

  const menus: FilterMenuSpec[] = [
    {
      label: 'Section',
      value: section ? SECTIONS[section].name : 'All',
      active: Boolean(section),
      options: [
        { key: 'all', label: 'All sections', href: view({ section: undefined }), current: !section },
        ...SECTION_IDS.filter((s) => lib.sections.includes(s)).map((s) => ({
          key: s,
          label: SECTIONS[s].name,
          href: view({ section: s }),
          current: section === s,
        })),
      ],
    },
    languageMenu(lang, (code) => view({ lang: code })),
    ...(allCollections.length
      ? [
          {
            label: 'Collection',
            value: collection?.name ?? 'All',
            active: Boolean(collection),
            options: [
              { key: 'all', label: 'Everything', href: view({ c: undefined }), current: !collection },
              ...allCollections.map((c) => ({ key: c.id, label: c.name, hint: `${c.count} ${c.count === 1 ? 'item' : 'items'}`, href: view({ c: c.id }), current: collection?.id === c.id })),
            ],
          },
        ]
      : []),
    {
      label: 'Sort',
      value: LIBRARY_SORTS[sort],
      active: sort !== 'recent',
      options: (Object.keys(LIBRARY_SORTS) as LibrarySort[]).map((k) => ({
        key: k,
        label: LIBRARY_SORTS[k],
        href: view({ sort: k === 'recent' ? undefined : k }),
        current: sort === k,
      })),
    },
  ];

  const filtered = Boolean(q || section || lang || collection);
  const hidden: Record<string, string> = {};
  if (collection) hidden.c = collection.id;
  if (section) hidden.section = section;
  if (lang) hidden.lang = lang;
  if (sort !== 'recent') hidden.sort = sort;

  return (
    <>
      <PageHeading
        title="My library"
        lede={`${lib.totalItems.toLocaleString('en')} ${lib.totalItems === 1 ? 'item' : 'items'}${
          lib.others.length ? ` and ${lib.others.length} other ${lib.others.length === 1 ? 'file' : 'files'}` : ''
        }, ${formatBytesServer(lib.totalBytes)} in ${root.replace(/^\/Users\/[^/]+/, '~')}`}
      />
      <div className="mb-8 max-w-3xl space-y-4">
        <SearchBox action="/library" placeholder="Search your library" defaultValue={q} hidden={hidden} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar menus={menus} />
          <div className="flex items-center gap-5 text-sm">
            <Link href={q ? `/library/inside?${new URLSearchParams({ q })}` : '/library/inside'} className="text-accent underline-offset-4 hover:underline">
              {q ? `Search inside your books for “${q}”` : 'Search inside your books'}
            </Link>
            <Link href="/notes" className="text-accent underline-offset-4 hover:underline">
              Highlights &amp; notes
            </Link>
            <Link href="/reading" className="text-accent underline-offset-4 hover:underline">
              Reading
            </Link>
          </div>
        </div>
      </div>

      {collection ? <CollectionTools key={collection.id} id={collection.id} name={collection.name} count={collection.count} /> : null}
      {lib.entries.length === 0 ? (
        <Empty title={collection && !q && !section && !lang ? `Nothing in “${collection.name}” yet.` : filtered ? 'Nothing in your library matches.' : 'No downloaded items yet.'}>
          {filtered ? (
            <p>
              <Link href="/library" className="text-accent underline underline-offset-4">
                Show everything
              </Link>
            </p>
          ) : null}
        </Empty>
      ) : (
        <>
          {filtered ? (
            <p className="mb-6 text-ink-soft">
              Showing {lib.entries.length.toLocaleString('en')} of {lib.totalItems.toLocaleString('en')}.
            </p>
          ) : null}
          <TileGrid>
            {lib.entries.map((e) => (
              <LibraryTile key={e.identifier} entry={e} collections={options} member={membership.get(itemRef(e.identifier)) ?? []} />
            ))}
          </TileGrid>
        </>
      )}

      {lib.others.length > 0 ? (
        <section className="t-section mt-14">
          <h2 className="font-display text-2xl text-ink">Other files</h2>
          <p className="mt-1 mb-5 text-sm text-ink-soft">In your download folder, but not downloaded by Stacks.</p>
          <ul className="divide-y divide-rule border-y border-rule">
            {lib.others.map((f) => (
              <li key={f.relative} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
                <span className="min-w-0">
                  <span className="font-title block truncate text-ink">{f.name}</span>
                  <span className="block text-sm text-ink-faint">
                    {f.relative.includes('/') ? `${f.relative.slice(0, f.relative.lastIndexOf('/'))}, ` : ''}
                    {formatBytesServer(f.size)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-4">
                  <FileButtons target={{ file: f.relative }} />
                  <CollectionMenu itemRef={fileRef(f.relative)} all={options} member={membership.get(fileRef(f.relative)) ?? []} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** The file the reader opens for an item: its first PDF, else its first plain-text file. */
function readable(entry: LibraryEntry) {
  return entry.files.find((f) => f.ext === 'pdf') ?? entry.files.find((f) => f.ext === 'txt');
}

function LibraryTile({ entry, collections, member }: { entry: LibraryEntry; collections: CollectionOption[]; member: string[] }) {
  const toRead = readable(entry);
  const formats = [...new Set(entry.files.map((f) => f.ext.toUpperCase()).filter(Boolean))].join(', ');
  // With several files, Open shows their folder (the API does the same).
  return (
    <li>
      <Link href={itemHref(entry.identifier, entry.section)} className="group block">
        <Cover src={entry.thumbnail} title={entry.title} subtitle={entry.date} shape={entry.section === 'books' ? 'book' : 'page'} />
        <h3 className="font-title mt-3.5 line-clamp-2 text-[1.05rem] text-ink group-hover:text-accent">{entry.title}</h3>
      </Link>
      <p className="mt-1 text-sm text-ink-soft">
        {entry.files.length > 1 ? `${entry.files.length} files` : formats}
        {entry.files.length > 1 && formats ? ` (${formats})` : ''}, {formatBytesServer(entry.bytes)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4">
        {toRead ? (
          <Link
            href={`/reader?file=${encodeURIComponent(toRead.relative)}`}
            className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <BookOpen aria-hidden className="size-3.5" />
            Read
          </Link>
        ) : null}
        <FileButtons target={{ identifier: entry.identifier }} multiple={entry.files.length > 1} />
        <CollectionMenu itemRef={itemRef(entry.identifier)} all={collections} member={member} />
      </div>
    </li>
  );
}
