# Stacks — highlights, notes and bookmarks

> Status: owner chose "Highlights and notes", then approach A, "Draw boxes" (2026-11-14). Short design.

## Why

Mark shlokas and passages while reading, attach notes, find them again, export them. Recon on the owner's 4 PDFs: only 2 have a usable hidden text layer (good Devanagari); one has garbled legacy-font symbols, one has almost no text. Text-selection highlighting would fail on half the Library.

## Approaches

| | | |
|---|---|---|
| **A** | **Draw a box on the page**; keep any good text found under it | **Chosen**: works on every scan |
| B | Select text like Preview | Precise, but useless on scans without a good text layer |

## Design

- **Data** (`annotations` table): file (path in the download folder), identifier, page, kind (`highlight` / `bookmark` / `note`), rectangle as fractions of the page (independent of zoom), colour (yellow, green, blue, pink), note text, captured text, timestamps.
- **Reader (PDF):**
  - **Highlight tool** (toolbar button or `H`): drag a box on the page; on release the highlight is saved and its note editor opens. Normal mode: click a highlight to edit its note, change colour, or delete it.
  - **Captured text:** pdf.js text items whose positions fall inside the box, kept only if the text looks real (mostly Devanagari/Latin letters, not legacy-font symbols).
  - **Bookmark** this page (button or `B`); a page note without a highlight from the panel.
  - **Notes panel** (button or `N`): this book's bookmarks, highlights and notes by page; click to jump; **Export** as Markdown.
  - Highlights render as translucent boxes over the page in all three themes.
- **All highlights** page `/notes`: every book with annotations, grouped by book, newest first; search across notes and captured text; export everything as Markdown. Linked from the Library and the reader panel.
- `/reader?file=…&page=N` opens at a page (used by the notes lists).
- Plain-text files: out of scope for this version (scroll position, not pages).
- No sync, no sharing; everything stays in `data/stacks.db`.

## Calls made
- Four fixed highlight colours (readable on white scans in every theme).
- A note editor opens straight after drawing; leaving it empty keeps a plain highlight.
- Markdown export lists book, page, captured text (when there is any) and the note.

## Implementation notes (2026-11-14)

- **Captured text** uses each text item's horizontal extent: an item counts when it overlaps the box and its vertical centre lies inside, so a box that starts mid-line still catches the line (pdf.js items are usually whole lines, so the capture is the whole line). Words split across lines by the typesetter are rejoined ("al- ways" → "always").
- Captured text is shown as a quotation with a rule in the highlight's colour, in body type (not the heavy title face).
- **Markdown export** separates the quote and the note with blank lines; without them Markdown continues the quote lazily and swallows the note.
- `COLOR_FILL` / `COLOR_SOLID` live in `src/lib/shared/annotations.ts`: the server page `/notes` can't import values from a `'use client'` module.
- Verified on the test copy: draw (mid-line box captured the opening paragraph of Pride and Prejudice ch. 2), note, colour, delete, bookmark, page note, panel, export (per book and all), `/notes` search and links, all three themes.
