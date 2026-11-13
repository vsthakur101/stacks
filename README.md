# Stacks

A quiet, local reading room for the Internet Archive's written material (books, newspapers, magazines, government documents and manuscripts), with a call slip for bulk downloads.

Personal tool: runs on your Mac at `http://127.0.0.1:3000` and is not reachable from other machines.

## Run

```bash
npm install
npm run build
npm start
```

Open http://127.0.0.1:3000. Downloads go to `~/Books/Archive` by default (change it under Settings).

For development: `npm run dev`. Tests: `npm test`. Types: `npm run typecheck`.

## How it works

- **Catalog:** books come from Open Library (one clean record per book); everything else comes from archive.org's search and metadata APIs. Responses are cached in `data/stacks.db` (SQLite), so pages still load from cache when archive.org is down.
- **Call slip:** press + on any cover or issue to add it. The slip persists across pages. Choose **Download**, pick one format, and the local server fetches every item into `<folder>/<Section>/…`.
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
| `src/components/CallSlip.tsx` | the selection tray and format step |
| `src/instrumentation.ts` | wakes the download queue at server start |

To fix or extend the Manuscripts section, edit `curatedCollections` in `src/lib/server/catalog/sections.ts`.
