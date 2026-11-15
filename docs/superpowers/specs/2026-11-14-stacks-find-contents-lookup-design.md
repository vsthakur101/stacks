# Stacks — find in this book, contents, word lookup

> Status: owner chose these after highlights (2026-11-14): Find with **close matches**, **your own contents**, lookup **both ways**. Short design.

## Why

Reading Geeta Press, DLI and Sanskrit scans: find a word or verse in the book you're reading, jump to a chapter or a page the book's own index names, and look up a Sanskrit or Hindi word without leaving the page.

## Recon (2026-11-14, the owner's 4 PDFs)

- **No PDF outlines and no page labels** in any of them. A contents list read from the PDF would always be empty.
- **Text layer:** Raghuvansham and Geeta Ki Vibhoti have real Devanagari with OCR slips ("मोर" for "और"); Bhavrog has only a watermark line per page; Naveen Mahima is noisy Gujarati (our "real text" check rejected Gujarati entirely: fixed, all Indic scripts count).
- **Extraction is fast:** pdf.js in Node reads all text of Raghuvansham (332 pages, 563k characters, 107k items) in ~0.4 s.
- **Monier-Williams (Cologne)** matches headwords only: धर्म ✓, धर्मक्षेत्रे / समवेताः / युयुत्सवः ✗. Trimming case endings finds them (धर्मक्षेत्र, युयुत्सु); Cologne's simple search maps some forms (समवेताः → समवेत). Hindi words aren't in MW; **Wiktionary**'s definition API has them (भगवान "God, the Almighty", विभूति "glory, greatness").
- The reader draws pages on a canvas: no selectable text yet.

## Approaches (chosen in bold)

| Feature | Options |
|---|---|
| Find | Exact only · **Close matches** (OCR-tolerant, Roman or Devanagari input, text saved once) |
| Contents | PDF outline only (empty for the owner's books) · **Own contents**: named bookmarks + printed page numbers + outline when present |
| Lookup | Box only · Selectable text only · **Both**: text layer on the page (double-click) and a lookup box |

## Design

**Book text** (server): on the first Find in a book, pdf.js (Node) extracts every page's text and item positions (fractions of the page) into SQLite (`book_texts`, `book_text_pages`), keyed by file size + modified time so a replaced file is re-read. Books with almost no text (median under 200 characters a page) are reported as "no searchable text".

**Find** (`F` or ⌘F; side panel):
- Matching ignores spaces, punctuation, dandas, nukta, ZWJ/ZWNJ and case; chandrabindu = anusvara. So OCR word breaks don't matter.
- **Exact** matches first, then **close** matches (edit distance 1 for 4–7 letters, 2 for 8–13, then one per 6 letters), labelled "close".
- Roman input in a Devanagari book also searches its Devanagari form (Google Input Tools, as in search), shown as "Also searching for …".
- Results list by page with a snippet; Enter / Shift+Enter or ↑↓ buttons step through; the match is outlined on the page.

**Contents** (`C`; side panel):
- **Bookmarks with names** ("सर्ग ९", "अध्याय ११"): rename inline; unnamed ones show "Page N".
- **Printed page numbers:** "This page is printed page [161]" stores an offset per book (`book_prefs`). Stacks suggests the offset when running-head numbers agree on enough pages. With an offset, the toolbar shows the printed number and **Go to page** takes printed numbers (PDF page as a fallback toggle).
- **From the PDF:** the outline, when a book has one.

**Lookup** (`L`; side panel):
- **Text layer:** pdf.js's selectable text over the scan. Double-click a word to look it up; select a phrase and press `L`. Clicking on text waits a moment before turning the page, so a double-click doesn't turn it.
- **Box:** type Devanagari or Roman (converted via Google); click words in a highlight's captured text.
- **Sanskrit:** Monier-Williams for the word and its trimmed stems (nominal endings: -ः, -ाः, -म्, -े, -स्य, -ेन, -ाय, -ात्, -ानि, -ैः, -ेषु, -ानाम्, -वः→-ु, -यः→-ि …), then Cologne simple search, then the longest leading part that is a headword (compounds), each labelled with how it was found. Verb forms are out of scope.
- **Hindi (and some Sanskrit):** Wiktionary definitions.
- Responses cached in SQLite (30 days). Only the looked-up word is sent to Cologne / Wiktionary / Google.

## Calls made

- Text extraction on the server, saved in SQLite: instant repeat finds, and a base for a later library-wide search.
- Matching on code points with spaces removed, so a missing or extra OCR space never blocks a match.
- One side panel at a time (Notes, Contents, Find, Lookup).
- Page offset is one number per book; front matter in Roman numerals isn't modelled.

## Implementation notes (2026-11-14)

- **Blank DLI pages (existing bug, fixed):** Raghuvansham's scans are JPEG 2000; pdf.js 6 needs `wasmUrl` for its OpenJPEG/JBIG2 decoders or those images render blank. Served from `node_modules/pdfjs-dist/wasm` via `/pdf-wasm/<name>` (fixed whitelist).
- `pdfjs-dist` is a server external package (legacy build in Node for extraction).
- Close matches: equal-distance candidates prefer the length nearest the query; close matches snap to whole letters (matras) and word edges within 2 characters.
- Clicking text waits 300 ms before turning the page so a double-click can select a word; the highlight layer passes clicks through outside highlight mode.
- Monier-Williams cross-reference lines ("भगवत् &c. See p. 743") are dropped when real senses exist; Hindi "alternative spelling of X" pointers are replaced by X's meanings; Sanskrit "nominative singular of X" stays (it's the grammar).
- Verified on the test copy with Raghuvansham and Geeta Ki Vibhoti: find (exact, close, Roman→Devanagari, marks on page), suggested offset 5 applied, Go to printed page १५३ → PDF 158, named bookmark, double-click lookup of पतिव्रताः → पतिव्रता / पतिव्रत; highlights still open and draw.
