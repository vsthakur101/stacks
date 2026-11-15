import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { looksLikeRealText, textInRect } from '@/lib/shared/annotations';
import { openDb, setDbForTests } from '../db/client';
import { annotationsFor, createAnnotation, deleteAnnotation, toggleBookmark, toMarkdown, updateAnnotation } from './annotations';

beforeEach(() => setDbForTests(openDb(':memory:')));
afterEach(() => setDbForTests(undefined));

const FILE = 'Books/Raghuvansham (1913) [raghu].pdf';

describe('annotation store', () => {
  it('creates, edits, lists by page and deletes', () => {
    const b = createAnnotation({ file: FILE, identifier: 'raghu', page: 12, kind: 'highlight', rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 }, color: 'yellow', text: 'वागर्थाविव सम्पृक्तौ' });
    const a = createAnnotation({ file: FILE, identifier: 'raghu', page: 3, kind: 'note', note: '  Opening verse  ' });
    expect(annotationsFor(FILE).map((x) => x.page)).toEqual([3, 12]);
    expect(annotationsFor(FILE)[0]!.note).toBe('Opening verse');
    expect(updateAnnotation(b.id, { note: 'Kalidasa’s invocation', color: 'green' })).toMatchObject({ note: 'Kalidasa’s invocation', color: 'green', rect: { x: 0.1 } });
    expect(deleteAnnotation(a.id)).toBe(true);
    expect(annotationsFor(FILE)).toHaveLength(1);
  });

  it('toggles bookmarks', () => {
    expect(toggleBookmark(FILE, 'raghu', 5)).toMatchObject({ kind: 'bookmark', page: 5 });
    expect(annotationsFor(FILE).filter((a) => a.kind === 'bookmark')).toHaveLength(1);
    expect(toggleBookmark(FILE, 'raghu', 5)).toBeNull();
    expect(annotationsFor(FILE)).toHaveLength(0);
  });

  it('exports Markdown grouped by book and page', () => {
    createAnnotation({ file: FILE, identifier: 'raghu', page: 12, kind: 'highlight', rect: { x: 0, y: 0, w: 1, h: 1 }, color: 'yellow', text: 'वागर्थाविव', note: 'Invocation' });
    createAnnotation({ file: FILE, identifier: 'raghu', page: 4, kind: 'bookmark' });
    expect(toMarkdown([{ title: 'Raghuvansham', annotations: annotationsFor(FILE) }])).toBe(
      '# Highlights and notes\n\n## Raghuvansham\n\n- **Page 4**, Bookmark\n- **Page 12**, Highlight (yellow)\n\n  > वागर्थाविव\n\n  Invocation\n',
    );
  });
});

describe('captured text', () => {
  it('keeps real Devanagari or Latin, drops legacy-font symbols', () => {
    expect(looksLikeRealText('वागर्थाविव सम्पृक्तौ')).toBe(true);
    expect(looksLikeRealText('Mr. Bennet said')).toBe(true);
    expect(looksLikeRealText('¶ÉÉMÉÇ ´ÉÉÌiÉ ¨ÉÉ')).toBe(false);
    expect(looksLikeRealText('તેવો ખળવાન્ મોહ ઉત્પન્ન')).toBe(true);
  });

  it('takes the text items inside the box', () => {
    const items = [
      { str: 'वागर्थाविव', x: 0.2, y: 0.3 },
      { str: 'सम्पृक्तौ', x: 0.45, y: 0.3 },
      { str: 'outside', x: 0.9, y: 0.9 },
    ];
    expect(textInRect(items, { x: 0.1, y: 0.25, w: 0.5, h: 0.1 })).toBe('वागर्थाविव सम्पृक्तौ');
    expect(textInRect([{ str: '¶ÉÉMÉÇ´ÉÉÌiÉ', x: 0.2, y: 0.3 }], { x: 0.1, y: 0.25, w: 0.5, h: 0.1 })).toBe('');
  });

  it('catches a whole line when the box starts mid-line', () => {
    const lines = [
      { str: 'Mr. Bennet was among the earliest', x: 0.1, y: 0.2, w: 0.8 },
      { str: 'of those who waited on Mr. Bingley.', x: 0.1, y: 0.23, w: 0.8 },
      { str: 'Next paragraph', x: 0.1, y: 0.4, w: 0.8 },
    ];
    expect(textInRect(lines, { x: 0.4, y: 0.18, w: 0.3, h: 0.07 })).toBe('Mr. Bennet was among the earliest of those who waited on Mr. Bingley.');
    expect(textInRect([{ str: 'though to the last al-', x: 0.1, y: 0.2, w: 0.8 }, { str: 'ways assuring', x: 0.1, y: 0.22, w: 0.8 }], { x: 0.1, y: 0.18, w: 0.8, h: 0.06 })).toBe(
      'though to the last always assuring',
    );
    // A box entirely right of a short line misses it.
    expect(textInRect([{ str: 'Short line', x: 0.1, y: 0.2, w: 0.2 }], { x: 0.5, y: 0.18, w: 0.3, h: 0.07 })).toBe('');
  });
});
