# Stacks — contents from headings

> Status: roadmap "new" item, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Why
Naming a bookmark per chapter by hand is slow; the book's own text already has the headings (Find showed every "…सर्गः").

## Design
- Contents panel → **Contents from headings**: type the heading word or pick one (सर्गः, अध्याय, अध्यायः, पर्व, काण्ड, स्कन्ध, Chapter). `GET /api/headings?file=&word=` proposes chapter starts; all ticked by default; **Add N as bookmarks** (`POST /api/annotations/bookmarks`) names them. Pages that already have a named bookmark keep it; unnamed ones get the name.
- Detection (`library/headings.ts`), on the stored book text:
  - lines rebuilt from items; a heading line is in the top 12% of a page or ≤ 40 characters, contains the word, and isn't a colophon (इति / नाम);
  - scans repeat the chapter as a running head on every page, so a chapter starts at the **first page of each run** of the same heading (40-page window);
  - "same heading": when a number follows the word ("अ० १०") the number, compared exactly, and it must repeat on ≥ 2 pages (one-off numbers are OCR misreadings); otherwise the 8 letters before the word, allowing OCR slips (edit distance ≤ length/5);
  - names cleaned of folios ("( १५३"), OCR debris and stray marks; chapter numbers kept.
- Measured on the owner's books: Raghuvansham "सर्गः" → 14 chapter starts (the rest have garbled running heads); Geeta Ki Vibhoti "अ०" → its two chapters (10, 11) plus a few OCR leftovers to untick.
