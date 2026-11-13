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
- **Already downloaded:** covers and issues you have on disk show a tick; the item page offers Open file and Show in Finder.
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
