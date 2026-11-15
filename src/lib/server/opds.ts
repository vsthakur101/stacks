import { SECTIONS } from './catalog/sections';
import type { LibraryEntry } from './library/view';
import type { LibraryFile } from './library/scan';

/**
 * OPDS 1.2 (Atom) catalogue of the Library, for reading apps (KOReader, Moon+ Reader, Readest…).
 * Navigation feeds list ways in; acquisition feeds list books with covers and download links.
 * Links are root-relative so they work through phone access and on the Mac alike.
 */

export const NAV_TYPE = 'application/atom+xml;profile=opds-catalog;kind=navigation';
export const ACQ_TYPE = 'application/atom+xml;profile=opds-catalog;kind=acquisition';

const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  djvu: 'image/vnd.djvu',
  mobi: 'application/x-mobipocket-ebook',
};

export function xml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function feed(id: string, title: string, kind: 'navigation' | 'acquisition', self: string, entries: string[], extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog" xmlns:dc="http://purl.org/dc/terms/">
  <id>urn:stacks:${xml(id)}</id>
  <title>${xml(title)}</title>
  <updated>${new Date().toISOString()}</updated>
  <author><name>Stacks</name></author>
  <link rel="self" href="${xml(self)}" type="${kind === 'navigation' ? NAV_TYPE : ACQ_TYPE}"/>
  <link rel="start" href="/opds" type="${NAV_TYPE}"/>
  <link rel="search" href="/opds/opensearch.xml" type="application/opensearchdescription+xml"/>${extra}
${entries.join('\n')}
</feed>`;
}

export interface NavLink {
  id: string;
  title: string;
  href: string;
  content?: string;
}

export function navigationFeed(links: NavLink[]): string {
  const entries = links.map(
    (l) => `  <entry>
    <title>${xml(l.title)}</title>
    <id>urn:stacks:nav:${xml(l.id)}</id>
    <updated>${new Date().toISOString()}</updated>
    ${l.content ? `<content type="text">${xml(l.content)}</content>` : ''}
    <link rel="subsection" href="${xml(l.href)}" type="${ACQ_TYPE}"/>
  </entry>`,
  );
  return feed('root', 'Stacks', 'navigation', '/opds', entries);
}

const fileLink = (f: LibraryFile) => {
  const type = FILE_TYPES[f.ext];
  if (!type) return '';
  return `<link rel="http://opds-spec.org/acquisition" href="/api/file?${xml(new URLSearchParams({ file: f.relative, download: '1' }).toString())}" type="${type}" length="${f.size}"/>`;
};

export function acquisitionFeed(id: string, title: string, self: string, entries: LibraryEntry[], others: LibraryFile[] = []): string {
  const items = entries.map((e) => {
    const links = e.files.map(fileLink).filter(Boolean);
    if (!links.length) return '';
    const section = SECTIONS[e.section]?.name;
    return `  <entry>
    <title>${xml(e.title)}</title>
    <id>urn:stacks:item:${xml(e.identifier)}</id>
    <updated>${new Date(e.addedAt).toISOString()}</updated>
    ${e.date ? `<dc:issued>${xml(e.date)}</dc:issued>` : ''}
    ${section ? `<category term="${xml(e.section)}" label="${xml(section)}"/>` : ''}
    <link rel="http://opds-spec.org/image" href="${xml(e.thumbnail)}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${xml(e.thumbnail)}" type="image/jpeg"/>
    ${links.join('\n    ')}
  </entry>`;
  });
  const files = others
    .filter((f) => FILE_TYPES[f.ext])
    .map(
      (f) => `  <entry>
    <title>${xml(f.name.replace(/\.[a-z0-9]+$/i, ''))}</title>
    <id>urn:stacks:file:${xml(f.relative)}</id>
    <updated>${new Date(f.modifiedAt).toISOString()}</updated>
    ${fileLink(f)}
  </entry>`,
    );
  return feed(id, title, 'acquisition', self, [...items, ...files].filter(Boolean));
}

export function openSearchDescription(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Stacks</ShortName>
  <Description>Search your Stacks library</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="${ACQ_TYPE}" template="/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;
}
