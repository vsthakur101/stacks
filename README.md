# Stacks

A quiet, local reading room for the Internet Archive's written material (books, newspapers, magazines, government documents and manuscripts), with a call slip for bulk downloads.

Personal tool: runs on your Mac at `http://127.0.0.1:3000` and is not reachable from other machines.

## Run

```bash
npm install
npm run app
```

`npm run app` builds and starts the fast production version at http://127.0.0.1:3000. Use it day to day: `npm run dev` rebuilds pages as you visit them and is 1–3 s slower per page.

To have Stacks start whenever you log in (a macOS login item, logs in `~/Library/Logs/stacks.log`):

```bash
npm run autostart:on
```

`npm run autostart:off` removes it. After pulling new code, run `npm run autostart:on` again to rebuild.

Downloads go to `~/Books/Archive` by default (change it under Settings). Tests: `npm test`. Types: `npm run typecheck`.

## How it works

- **Catalog:** books come from Open Library (one clean record per book); everything else comes from archive.org's search and metadata APIs. Book searches can switch to "All scans on archive.org", which finds texts Open Library never catalogued (many Hindi and Sanskrit works, Geeta Press volumes). Every search can be narrowed by language; the list and archive.org's spelling variants live in `src/lib/shared/languages.ts`. Responses are cached in `data/stacks.db` (SQLite), so pages still load from cache when archive.org is down.
- **Spellings:** a search also matches other spellings of Indic words (mahabharat → mahabharata, महाभारत), shown as removable chips under the search box. Devanagari forms come from Google Input Tools: only the individual non-English words are sent, cached for 30 days; if Google is unreachable, searching still works. "Exact spelling only" turns it off.
- **Order:** archive.org results can be sorted by best match, most read, oldest or newest.
- **Home:** your recent searches (one per query, reopening the view you used last) and any search you saved with "Save as a shelf on Home".
- **My library** (`/library`): everything in your download folder, with search, Section, Language and Sort filters, and Open / Show in Finder on each item. It reads the folder itself (Stacks names files `… [archive-id]`), so it survives clearing the Downloads list and files moved within the folder; files Stacks didn't download appear under Other files. Spec: `docs/superpowers/specs/2026-11-14-stacks-library-design.md`.
- **Reader** (`/reader`): downloaded PDFs open in Stacks' own reader (pdf.js, loaded only there; files served in 1 MB ranges, so large magazines open at once), plain-text files as reading text. Keys ← → / Space to turn, + − 0 to zoom; whole page or fit width. Your page is remembered, and Home shows **Continue reading**. Spec: `docs/superpowers/specs/2026-11-14-stacks-reader-design.md`.
- **Highlights and notes** (PDF reader): press the highlighter (**H**) and drag a box around a passage; it's saved with any readable text found under it (real Devanagari or Latin from the PDF's text layer; legacy-font symbols are dropped), and a note editor opens. Four colours; click a highlight later to edit or delete it. **B** bookmarks the page, **N** opens this book's highlights, bookmarks and page notes (click to jump, **Export as Markdown**). **Highlights & notes** (`/notes`, linked from the Library) lists every book's entries, newest first, with search and export. `/reader?file=…&page=N` opens at a page. Stored in the `annotations` table. Spec: `docs/superpowers/specs/2026-11-14-stacks-highlights-design.md`.
- **Find, contents and lookup** (PDF reader):
  - **Find** (**F** or ⌘F) searches the whole book, tolerant of OCR slips: exact matches first, then close ones ("विभूति और" finds the scan's "विभूति ओर"); Roman input also searches Devanagari ("raghu" → रघु). Matches are outlined on the page. Each book's text is extracted once (pdf.js in Node, ~0.5 s) into SQLite.
  - **Grammar in Look up**: Sanskrit words are analysed by INRIA's Sanskrit Heritage (sandhi split, verb roots: अकुर्वत → कृ, imperfect 3rd plural) and the dictionary forms looked up in Monier-Williams. **Go to verse** (in Contents): "47" or "2.47" (chapters = your bookmarks) jumps to the page with "॥ ४७ ॥". Spec: `docs/superpowers/specs/2026-11-15-stacks-grammar-and-verses-design.md`.
  - **Text recognition** (Contents → Text recognition): your Mac reads the page images itself (Apple Vision, offline; Hindi/Marathi/Sanskrit in Devanagari and English) for scans with poor or no text; then Find, Library search, headings, verses and Read aloud use it. A 180-page book took under a minute. Spec: `docs/superpowers/specs/2026-11-15-stacks-text-recognition-design.md`.
  - **Read aloud** (**A**): the page sentence by sentence in the Mac's own voices (Lekha for Hindi/Devanagari, English otherwise), offline; the sentence being read is marked on the scan; pages turn by themselves; speed and voice choice. Spec: `docs/superpowers/specs/2026-11-15-stacks-read-aloud-design.md`.
  - **Contents from headings** (in Contents): type the word the chapter headings use (सर्गः, अध्याय, Chapter) and Stacks proposes where each chapter starts from the book's text (first page of each running head); tick and add them as named bookmarks. Spec: `docs/superpowers/specs/2026-11-15-stacks-contents-from-headings-design.md`.
  - **Contents** (**C**): name your bookmarks ("सर्ग ९") to make the book's contents; **printed page numbers** (suggested from the page folios, e.g. "5 behind") so **Go to page** follows the book's own index; the PDF's outline when it has one.
  - **Look up** (**L**, or double-click a word on the page, or click a word in a highlight): Sanskrit from Monier-Williams (Cologne), tracing inflected forms to their dictionary form (धर्मक्षेत्रे → धर्मक्षेत्र, युयुत्सवः → युयुत्सु); Hindi from Wiktionary. Only the word is sent; answers are cached 30 days.
  - The reader also decodes JPEG 2000 and JBIG2 scans now (DLI books rendered blank before).
  - Spec: `docs/superpowers/specs/2026-11-14-stacks-find-contents-lookup-design.md`.
- **Backup** (Settings → Backup): download one JSON file with your highlights, notes, bookmarks, reading positions, printed page numbers, Home shelves, searches and settings; restore merges (adds what's missing, keeps the newer copy, deletes nothing). A copy is also saved daily in `<download folder>/.stacks-backups/` (last 30). Spec: `docs/superpowers/specs/2026-11-15-stacks-backup-design.md`.
- **Search inside books** (`/inside`, linked from Search): archive.org's full-text search over the recognised text of scans, Devanagari included. Passages with the matches marked; **Exact phrase** for verse lines; language filter; romanised words also search Devanagari. Downloaded books get **Read here** (our reader with Find already searching); others open on archive.org with the search applied. Slow upstream (3–12 s), cached 1 hour. Spec: `docs/superpowers/specs/2026-11-15-stacks-search-inside-design.md`.
- **Search inside your books** (`/library/inside`, linked from the Library): every downloaded PDF's text, offline, in milliseconds. Exact matches (ignoring spaces and punctuation), grouped by book with page snippets that open the reader there. Book text is read in the background (one at a time). Spec: `docs/superpowers/specs/2026-11-15-stacks-library-search-design.md`.
- **More like this** on item pages: archive.org's related items as a row of covers (streamed after the page; cached a week).
- **Reading** (`/reading`, linked from the Library): time read and pages this week, month and year, a six-month calendar of reading days, most-read books and a Finished shelf. Time counts only while a book is open in the reader and in use. Spec: `docs/superpowers/specs/2026-11-15-stacks-reading-stats-design.md`.
- **Collections** in the Library: your own groups ("Puranas", "To read") via **Add to collection** on any tile or file; a Collection filter; rename and delete (books stay). Included in Backup. Spec: `docs/superpowers/specs/2026-11-15-stacks-collections-design.md`.
- **Watched searches**: shelves saved to Home (archive.org searches) show uploads added since you last looked first, marked New, with "N new since …" and **Mark as seen**. Catalogued-book shelves (Open Library) have no upload dates and aren't watched.
- **Match your own files**: in the Library's Other files, **Find on archive.org** suggests the item a file is a copy of (same-size files flagged) and **Use this** links it, giving it cover, details and sets. Files are never renamed; **Unlink** undoes it. Spec: `docs/superpowers/specs/2026-11-15-stacks-match-files-design.md`.
- **Phone access** (Settings, off by default): over Tailscale only, with a Stacks password; a sign-in page for browsers and Basic auth for reading apps. **OPDS catalogue** at `/opds` (recent, everything, sections, collections, search) for KOReader, Moon+ Reader, Readest. Install Tailscale on the Mac and phone first. Spec: `docs/superpowers/specs/2026-11-15-stacks-phone-access-design.md`.
- **EPUB reader**: downloaded EPUBs open in Stacks (epub.js): pages or scrolling, the app's colours, text size, contents, remembered exact place. Spec: `docs/superpowers/specs/2026-11-15-stacks-epub-reader-design.md`.
- **Send to an e-reader**: with a Kindle, Kobo or other e-reader plugged in by USB, Library tiles get **Send to <device>** (Kindles get the PDF; EPUBs are converted when Calibre is installed). Spec: `docs/superpowers/specs/2026-11-15-stacks-send-to-device-design.md`.
- **Multi-volume sets:** in Books (all scans), Government and Manuscripts, volumes of one set appear as a single card ("Siva Purana, 4 volumes, parts 1–4") linking to a set page with every volume and **Add all to selection**. Volumes are recognised from archive.org's volume field or the title (Part II, Vol-V, Khand Three, भाग २…) plus a shared identifier pattern (random four-character upload codes are ignored); a shared title alone never groups, so different editions stay apart. **Volumes: Separately** in the filter bar turns it off. In the reader, **Next volume** appears on the last page when the next volume is downloaded. Spec: `docs/superpowers/specs/2026-11-14-stacks-volumes-design.md`.
- **Already downloaded:** covers and issues you have on disk show a tick (from the same folder scan); the item page offers Open file and Show in Finder.
- **Look:** three themes, chosen under Settings: **Catalogue** (default; white, crisp, ultramarine), **Reading** (soft, app-like, rounded) and **Poster** (each section has its own colour). Light or dark follows your Mac. All theme differences live in `src/app/globals.css`; components use shared tokens only. Spec: `docs/superpowers/specs/2026-11-14-stacks-themes-design.md`.
- **Selection:** press + on any cover or issue to select it. Your selection persists across pages. Choose **Review and download**, pick one format, and the local server fetches every item into `<folder>/<Section>/…`.
- **Speed:** pages stream: the search box and filters appear at once and each group of results fills in as its source answers. Cached results older than their freshness window are shown instantly and refreshed in the background. archive.org, Open Library and Google each get their own queue of 4 requests. Connections are kept open for 10 minutes and warmed at start-up and while you're active, because new connections from Node to archive.org intermittently stall for ~19 s (see `src/lib/server/net.ts`). Covers are cached on disk in `data/covers` and kept by the browser for 30 days (archive.org only allows 5 minutes); a return visit to a 24-cover grid takes 0.06 s instead of ~1.3 s. The next results page is preloaded when the pager scrolls into view.
- **Downloads:** 3 at a time by default. Interrupted downloads resume from the partial file (including after a restart), files are checked against archive.org's size and MD5, and files you already have are skipped.
- **Limits:** borrow-only (lending library) scans are never downloaded. Missing formats are skipped or substituted, depending on the fallback you choose.

Design: [`docs/superpowers/specs/2026-11-13-stacks-phase1-design.md`](docs/superpowers/specs/2026-11-13-stacks-phase1-design.md).

## Where things live

| Path | What |
|---|---|
| `src/lib/server/catalog/` | archive.org and Open Library clients, section config (`sections.ts`), metadata clean-up |
| `src/lib/server/downloads/` | format mapping, file naming, resumable fetcher, download queue |
| `src/lib/server/http.ts` | shared outbound client: rate limit (4 concurrent), cache, stale fallback |
| `src/app/api/` | local-only JSON API (guarded against cross-site requests) |
| `src/components/CallSlip.tsx` | the selection bar, panel and format step |
| `src/components/FilterBar.tsx` | the one-line filter bar (language, order, source, spellings) |
| `src/instrumentation.ts` | wakes the download queue at server start |

To fix or extend the Manuscripts section, edit `curatedCollections` in `src/lib/server/catalog/sections.ts`.
