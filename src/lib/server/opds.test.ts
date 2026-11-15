import { describe, expect, it } from 'vitest';
import { acquisitionFeed, navigationFeed, xml } from './opds';

describe('OPDS', () => {
  it('escapes XML', () => {
    expect(xml(`a<b>&"c'`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  it('builds navigation and acquisition feeds with covers and download links', () => {
    expect(navigationFeed([{ id: 'recent', title: 'Recently added', href: '/opds/recent' }])).toContain('<link rel="subsection" href="/opds/recent"');
    const feed = acquisitionFeed('recent', 'Recently added', '/opds/recent', [
      {
        identifier: 'raghu',
        section: 'books',
        title: 'Raghuvansham & commentary',
        language: 'san',
        thumbnail: '/cover/ia/raghu',
        files: [{ path: '/x/R.pdf', relative: 'Books/R [raghu].pdf', name: 'R [raghu].pdf', size: 1234, modifiedAt: 0, ext: 'pdf' }],
        bytes: 1234,
        addedAt: 0,
      },
    ]);
    expect(feed).toContain('<title>Raghuvansham &amp; commentary</title>');
    expect(feed).toContain('rel="http://opds-spec.org/image" href="/cover/ia/raghu"');
    expect(feed).toContain('href="/api/file?file=Books%2FR+%5Braghu%5D.pdf&amp;download=1" type="application/pdf" length="1234"');
  });
});
