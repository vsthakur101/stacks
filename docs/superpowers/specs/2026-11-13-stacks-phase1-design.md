# Stacks — Phase 1 Design

> Working name: **Stacks** (library stacks). Rename freely.
> Status: draft for approval · 2026-11-13

---

## 1. Intent

A **personal, local-only** reading-and-collecting tool over the Internet Archive's written material — books, newspapers, magazines, government documents, manuscripts.

archive.org already has all of this, but its UI crams search, metadata, files, reviews and navigation onto single pages, and getting files out is a multi-click chore per item (find → item page → format → download tab → save). Stacks exists to fix two things:

1. **Calm, elegant browsing.** One job per page, real navigation between pages, generous design. A revamp, not a clone of their look.
2. **Bulk download.** Select many items across pages and sections, pick a format once, click Download, and the files land organized on disk.

Single user (the owner), runs on their Mac at `localhost`.

## 2. Goals / Non-goals / Anti-goals

**Goals (Phase 1)**
- Separate, uncluttered sections for Books, Newspapers, Magazines, Government Docs, Manuscripts.
- Global search with results grouped by section; per-section search.
- Item pages and an in-app reading view.
- Cross-page **selection tray** + **bulk download** in a chosen format, with progress, resume, retry, skip-existing.

**Non-goals (Phase 1)** — candidates for Phase 2+
- Our own reader (Phase 1 embeds archive.org's).
- Saved library / reading lists / notes / reading progress.
- Full-text search inside books.
- Phone / remote access, user accounts, multi-user.
- Video, audio, software, web archives.
- Uploading or writing anything to archive.org.

**Anti-goals** — would make this a failure even if it works
- Cluttered pages: if a page needs a second sidebar, it should be a second page.
- Looking like, or presenting itself as, archive.org (their name, logo, visual identity). Credit "Content from the Internet Archive / Open Library" instead.
- Bypassing access controls: borrow-only / print-disabled items are never downloaded or proxied.
- Hammering archive.org: no crawling, no mirroring, bounded concurrency.
- Exposing a disk-writing server to the network.

## 3. Constraints (verified live 2026-11-13)

| Fact | Consequence |
|---|---|
| archive.org + Open Library read APIs are free, keyless, `Access-Control-Allow-Origin: *` on API responses | No scraping needed |
| Corpus: ~53M `texts` items; newspapers ~3.3M, periodicals ~2.4M, magazine_rack ~680K, fedlink ~394K | Query live; cache only what's viewed |
| archive.org stores **scans**; one title can have dozens (Pride & Prejudice: 20+). Open Library groups scans into **works** with clean author/cover/subject data and `ebook_access` (`public` ~1.87M, `borrowable` ~2.9M, `printdisabled` ~830K) | Books catalog comes from Open Library; files/reading from archive.org |
| File storage nodes (`dnXXXX.ca.archive.org`, reached via 302 from `/download/{id}/{file}`) send **no CORS header and no `Content-Disposition`** | Browser can't fetch-and-save; a local server must download |
| Files support `Accept-Ranges: bytes` | Resumable downloads |
| Restricted items (`access-restricted-item: true`, collections `inlibrary`/`printdisabled`): content files have `private: "true"` and return **403**; only LCP/ACS-encrypted variants are public | Not selectable for download |
| Formats vary per item (e.g. one public P&P scan has PDF, DjVu, TXT, JP2 ZIP — no EPUB) | Format picker shows per-format availability counts |
| `/metadata/{id}` gives every file's `name`, `format`, `size`, `md5`, `private` | Size + md5 verification after download |
| Non-book sections are **hierarchical**: section collection → publication sub-collections (`mediatype:collection`, e.g. `computermagazines`) → issues (`mediatype:texts`) | Section pages browse publications, publication pages browse issues |
| `collection` field on items is polluted with `fav-<user>` entries | Strip `fav-*` before display/logic |
| No clean manuscripts collection exists (`subject:manuscripts` returns mostly Arabic book uploads) | Manuscripts section driven by a curated config (see §6) |
| `archive.org/embed/{id}` → 301 → `/details/{id}?view=theater&ui=embed&wrapper=false`, no `X-Frame-Options` | Embeddable reader for Phase 1 |
| Rate limits undocumented; archive.org had multi-day outages in Oct 2024 | Bounded concurrency, caching, graceful degraded states |

## 4. Approaches considered

| | Approach | Trade-offs | Decision |
|---|---|---|---|
| **A** | **Local app**: web UI + local Node server on the Mac; server downloads straight into a folder | Free, no size/timeout limits, resumable, organized on disk. Only on that Mac. | **Chosen** |
| B | Hosted site + server that streams a ZIP | Works from any device. Paid bandwidth (all bytes transit), serverless timeouts, giant non-resumable ZIPs, needs auth. | Rejected for Phase 1; A can be hosted later |
| C | Browser-only | Impossible: storage nodes lack CORS/`Content-Disposition` | Rejected |

## 5. Architecture

```
 Browser  (http://127.0.0.1:3000)
 ┌───────────────────────────────────────────────────────────────────┐
 │ Home · Books · Newspapers · Magazines · Government · Manuscripts   │
 │ Search · Work · Item · Read · Downloads · Settings                 │
 │                             [ Selection tray · 7 ▸ ]  (Zustand,    │
 │                                                  persisted locally) │
 └──────────────┬──────────────────────────────────▲─────────────────┘
                │ RSC page loads / route handlers   │ SSE progress
 Next.js server ▼ (single Node process, bound 127.0.0.1)
 ┌───────────────────────────────────────────────────────────────────┐
 │ catalog/                          downloads/                       │
 │  openLibrary.ts  (works, authors,  manager.ts   job+task queue     │
 │                   subjects, search) resolver.ts  id → files per fmt │
 │  archive.ts      (advancedsearch,  fetcher.ts   stream, Range,     │
 │                   metadata)                     md5, retry          │
 │  sections.ts     (section configs) paths.ts     naming, sanitizing │
 │  normalize/*     (per-section      events.ts    SSE broadcaster    │
 │                   display cleanup)                                  │
 │ http/  outbound client: UA, timeout, 4-concurrent limiter, cache   │
 │                                                                     │
 │ SQLite (data/stacks.db): http_cache · download_jobs · download_tasks│
 │                          · settings                                 │
 └──────┬─────────────────────┬───────────────────────────┬──────────┘
        ▼                     ▼                           ▼
  openlibrary.org        archive.org                dnXXXX.*.archive.org
  covers.openlibrary.org (search, metadata,         (file bytes)
                          services/img, embed)            │
                                                          ▼
                                       ~/Books/Archive/<Section>/...
```

**Process model.** One `next start` process. The download manager is a module-level singleton pinned on `globalThis` (survives HMR in dev without spawning duplicate queues). On boot it reloads non-terminal tasks from SQLite and re-queues them.

## 6. Data sources per section

| Section | Source | Browse model | Search |
|---|---|---|---|
| **Books** | Open Library | Subjects (`/subjects/{slug}.json?ebooks=true`), authors (`/authors/{id}.json`, `/authors/{id}/works.json`) | `openlibrary.org/search.json` with `fields=key,title,author_name,author_key,first_publish_year,cover_i,ebook_access,ia,subject` |
| **Newspapers** | archive.org `collection:newspapers` | Publications (`mediatype:collection`) → issues sorted by `date` | `advancedsearch.php`, `q=(<user query>) AND collection:newspapers AND mediatype:texts` |
| **Magazines** | `magazine_rack`, `periodicals`, `pulpmagazinearchive` | same as Newspapers | same pattern |
| **Government** | `fedlink`, `governmentpublications` | Agencies (sub-collections) → documents | same pattern |
| **Manuscripts** | curated list of collection IDs + `title:manuscript` filter | Collections → items | same pattern |

Section definitions live in one typed config (`catalog/sections.ts`): root collection IDs, display name, default sort, item-card variant, path template for downloads. Adding or fixing a section (notably Manuscripts, whose initial list will need curation) is a config edit, not a code change.

**Book → scan resolution.** Selection and download operate on **archive.org identifiers** (scans), not Open Library works. The work page lists a work's scans (`ia` field) with access state. "Select" on a work card picks the **default free scan**: among the work's `ia` IDs, query archive.org for `identifier:(…) AND NOT collection:(inlibrary OR printdisabled)` sorted by `downloads desc`, take the first. If none, the card shows "Borrow on archive.org" (external link) and no checkbox.

**Books access filter.** Book search and subject pages default to **Free to read** (`ebook_access:public`), with a toggle "Include borrow-only" that adds `borrowable`/`printdisabled` works rendered with a "Borrow on archive.org" link instead of a checkbox.

**Publication hierarchy.** A publication page first lists any child collections (`mediatype:collection AND collection:<id>`) — nesting depth varies — then its items. Year navigation: two `rows=1` queries (`sort date asc` / `desc`) give the year span; each year is loaded with `date:[YYYY-01-01 TO YYYY-12-31]` sorted by date, grouped into months client-side. Items without a parseable `date` go into an "Undated" group.

**Display cleanup (`normalize/*`).** Strip `fav-*` collections; parse `date` into year/month/day where possible; collapse whitespace/underscores in machine titles; prefer `publisher`/parent-collection title for publication names; fall back to identifier only when no title exists.

## 7. Pages

One job per page. Every list page supports selection.

| Route | Job |
|---|---|
| `/` | A search box and 3–4 curated shelves (e.g. "Classics", "Old computer magazines"). Nothing else. |
| `/search?q=` | Results grouped by section ("12 books · 340 newspapers · 5 magazines"), top few per section + "See all in Newspapers →" |
| `/books` | Subject shelves + book search |
| `/books/[workId]` | Cover, title, author, year, description, subjects; available scans with format chips; **Read**, **Select** |
| `/authors/[authorId]` | Bio, photo, their works |
| `/subjects/[slug]` | Works in a subject, paged |
| `/newspapers`, `/magazines`, `/government` | Publications in the section (searchable, paged) |
| `/{section}/[collectionId]` | One publication: issues grouped by year → month; select an issue, a month, or a year |
| `/manuscripts` | Curated collections → items |
| `/item/[identifier]` | Generic item page for any scan: title, date, source collection, description, available formats + sizes; **Read**, **Select** |
| `/read/[identifier]` | Full-viewport reader (Phase 1: iframe `archive.org/embed/{id}`), thin top bar with back + title only |
| `/downloads` | Jobs and per-file progress, retry/cancel, "Reveal in Finder" |
| `/settings` | Download folder, concurrency, filename template preview |

Paging: 24 cards per page, numeric pager (not infinite scroll; predictable and selectable).

## 8. Selection tray & bulk download

**Tray.** A small persistent pill (bottom-right) — `7 selected ▸`. Expands to a drawer listing selected items (thumbnail, title, section, remove). Persisted in `localStorage` via Zustand `persist`, wrapped so a storage failure degrades to in-memory. Holds `{ identifier, title, section, publication? }`. Bulk selection helpers on list pages: "Select page", and on publication pages "Select month/year". The tray caps at **500 items**; a bulk select that would exceed it adds up to the cap and says so.

**Download dialog.**

```
┌ Download 10 items ─────────────────────┐
│ Format                                  │
│ ● PDF               10 of 10   ~84 MB   │
│ ○ EPUB               6 of 10   ~9 MB    │
│ ○ Plain text        10 of 10   ~6 MB    │
│ ○ DjVu               8 of 10   ~71 MB   │
│ ○ Page images (ZIP)  10 of 10  ~1.4 GB  │
│ If an item lacks it: [ Skip ▾ ]         │
│   (Skip · Use PDF · Use Plain text)     │
│ 2 borrow-only items excluded            │
│                          [ Download ]   │
└─────────────────────────────────────────┘
```

Counts/sizes come from `POST /api/formats { identifiers[] }`, which fetches each item's metadata (cached) and returns the availability matrix.

**Format mapping** (archive.org `format` → friendly):

| Friendly | archive.org formats (priority order) |
|---|---|
| PDF | `Text PDF`, `Additional Text PDF`, `Image Container PDF`, `PDF` |
| EPUB | `EPUB` |
| Plain text | `DjVuTXT` |
| DjVu | `DjVu` |
| Page images (ZIP) | `Single Page Processed JP2 ZIP` |

Always excluded: any file with `private: "true"`, `LCP Encrypted *`, `ACS Encrypted *`, and all metadata/log/OCR-internal formats (`Metadata`, `Scandata`, `Abbyy GZ`, `hOCR`, `chOCR`, `Djvu XML`, `Archive BitTorrent`, thumbnails, logs).

**Multiple files of one format in one item** (multi-volume uploads): take the highest-priority format present; download *all* files of it into a subfolder named after the item.

## 9. Download manager

**Model.** A **job** = one Download click (format, fallback, item list). A **task** = one file.

```
task:  queued → resolving → downloading → verifying → done
                    │            │            │
                    └──► skipped(reason)       └──► failed(md5|size)
                         failed(reason)  ◄── retries exhausted / 403 / 404
       any non-terminal ──► cancelled
```

- **Resolving:** metadata → pick file(s) per format mapping + fallback rule → compute destination path. Restricted or no-match → `skipped` with reason.
- **Concurrency:** 3 tasks downloading at once (configurable 1–6). Outbound API calls separately limited to 4 concurrent.
- **Writing:** stream to `<dest>.part`; on completion verify size and `md5` from metadata, then atomic `rename` to `<dest>`.
- **Resume:** if `.part` exists, send `Range: bytes=<size>-`; on `206` append, on `200` truncate and restart. md5 computed over the whole file during verify.
- **Skip existing:** if `<dest>` exists and size matches metadata → `done (already had it)` with no network transfer.
- **Retries:** network errors, `5xx`, `429` → up to 5 attempts, exponential backoff 2s→60s with jitter, honor `Retry-After`. `403`/`404` → fail immediately.
- **Restart safety:** on boot, `resolving/downloading/verifying` → `queued`.
- **Progress:** `GET /api/downloads/events` (SSE), per-task bytes/total/state, throttled to ~4 updates/sec per task.
- **Disk-full / permission errors:** fail the task with a readable reason; pause the queue on `ENOSPC`.

**Paths.** Root default `~/Books/Archive` (Settings).

```
Books/        <Title> (<Year>) [<identifier>].<ext>
Newspapers/   <Publication>/<YYYY-MM-DD> <Title> [<identifier>].<ext>
Magazines/    <Publication>/<YYYY-MM-DD> <Title> [<identifier>].<ext>
Government/   <Agency>/<Title> (<Year>) [<identifier>].<ext>
Manuscripts/  <Title> [<identifier>].<ext>
```

The identifier keeps different scans of the same title from colliding. Sanitize: NFC-normalize, strip `/ \ : * ? " < > |` and control chars, collapse whitespace, truncate the title so the filename ≤ 200 bytes. After joining, the resolved path **must** stay inside the root (reject otherwise).

**API**
```
POST   /api/formats              { identifiers[] } → availability matrix
POST   /api/downloads            { identifiers[], format, fallback } → { jobId }
GET    /api/downloads            jobs + tasks
GET    /api/downloads/events     SSE stream
POST   /api/downloads/:jobId/retry     retry failed tasks
DELETE /api/downloads/:jobId           cancel non-terminal tasks
POST   /api/reveal               { taskId } → `open -R <path>` (path from DB, never from client)
```

## 10. Outbound client, caching, politeness

- One `http` module for all external calls: `User-Agent: Stacks/0.1 (personal, non-commercial)`, 15s timeout for API calls, no timeout for file streams (stall detection instead: abort if no bytes for 60s, then retry).
- `http_cache` in SQLite keyed by full URL: search 1h, metadata 24h, collection listings and subjects 7d. Serve stale on upstream failure and show a quiet "archive.org is unreachable — showing saved results" notice.
- Home-page grouped search = 1 Open Library + 4 archive.org count queries (`rows=0`), in parallel through the limiter.

## 11. Persistence (SQLite via better-sqlite3 + Drizzle)

```
http_cache      (url PK, status, body, fetched_at, ttl_s)
download_jobs   (id PK, created_at, format, fallback, item_count, state)
download_tasks  (id PK, job_id FK, identifier, file_name, format,
                 dest_path, bytes_total, bytes_done, md5,
                 state, error, attempts, updated_at)
                 idx_download_tasks_job_id, idx_download_tasks_state
settings        (key PK, value)
```

DB file at `<project>/data/stacks.db` (gitignored).

## 12. Visual direction

The owner's top priority after function. A starting direction that the first build will make concrete for the owner to react to:

- **Feel:** a quiet reading room. Editorial, cover-forward, lots of whitespace, one primary action per screen.
- **Type:** a serif for headings and titles (e.g. Newsreader or Fraunces), a neutral sans for UI (e.g. Inter).
- **Color:** warm paper off-white background, near-black ink, one restrained accent (deep library green or oxblood). Full dark mode.
- **Cards:** books show covers; newspapers/magazines/documents show the first-page thumbnail (`archive.org/services/img/{id}`), with a typographic fallback card when no image exists.
- **Reader:** dark surround, chrome reduced to back + title.
- **Navigation:** top bar with the five sections + search; the selection tray is the only floating element.
- **Footer:** "Content from the Internet Archive and Open Library."

## 13. Failure modes

| Failure | Behavior |
|---|---|
| archive.org / Open Library down | Serve from cache; otherwise a calm empty state with retry. Downloads keep retrying with backoff. |
| Item metadata missing/malformed | Item card falls back to identifier; excluded from format counts with a visible reason. |
| Item became restricted after selection | Task `skipped (borrow-only)`. |
| Laptop sleeps / app restarts mid-download | `.part` + Range resume on next boot. |
| Two jobs include the same file | Second task sees the first's in-flight path and waits, then skips as existing. |
| Selection holds hundreds of items | `/api/formats` processes in batches through the limiter; dialog shows progress while counting. |

## 14. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict, Node 20+ |
| UI | Tailwind CSS + shadcn/ui (Radix), restyled to §12 |
| Client state | Zustand (`persist`) for the tray; TanStack Query for downloads list + SSE |
| Validation | Zod on all external API responses and route-handler inputs |
| DB | SQLite, better-sqlite3, Drizzle ORM + migrations |
| Downloads | Node `fetch` (undici) streams, `p-limit`, `node:crypto` md5 |
| Tests | Vitest (resolver, format mapping, path sanitizing, normalizers, manager state machine against a local fake file server); Playwright smoke for select → download |
| Run | `npm run build && npm start`, bound to `127.0.0.1:3000` |

## 15. Phase 1 acceptance criteria

1. Each of the five sections loads, browses, and searches; global search groups results by section.
2. Work and item pages show formats and sizes; Read opens the full-viewport reader.
3. Select items across at least two sections, open the tray, pick a format, Download: files land in the correct folders with the right names.
4. Borrow-only items cannot be selected; missing formats follow the fallback rule; both are reported in the job.
5. Kill the server mid-download, restart: the job resumes from the partial file and the md5 verifies.
6. Re-downloading the same selection transfers nothing and reports "already had it".
7. The server is unreachable from another machine on the LAN.

## 16. Phase 2+ backlog (not designed here)

Own reader on IIIF page images · full-text search inside texts · saved library, lists, notes, reading progress · phone access (host A behind Tailscale or similar) · smarter metadata cleanup for newspapers/magazines · audio/video sections.

## 17. Calls made, and what's left to the builder

**Calls made in this design (owner may override):**
- Open Library as the books catalog; selection operates on archive.org scan IDs; "default free scan" = most-downloaded unrestricted scan.
- Selection tray persisted in the browser.
- Filename scheme and folder layout in §9; default root `~/Books/Archive`.
- Phase 1 reader = embedded archive.org reader.
- Missing-format fallback default = Skip.
- 3 concurrent downloads, 4 concurrent API calls.
- Numeric paging, 24 per page.
- Books default to "Free to read", borrow-only behind a toggle.
- Tray cap of 500 items.
- Visual direction in §12.

**Left to the builder:**
- Initial curated collection IDs for Manuscripts and the Home shelves.
- Exact fonts/accent within §12's direction.
- Component structure, file layout inside `src/`.

---

## 18. Implementation notes (2026-11-13, phase 1 build)

Where the build differs from the design above, and why:

- **Visual direction revised.** §12's "warm off-white + serif + oxblood" is the most common generated-design default. Built instead: cool archival-board paper (`#F2F3EF`), blue-black ink (`#1C2431`), bookbinding-green accent (`#2E5B4F`), Spectral (serif) + Public Sans. The selection tray is styled as a library **call slip** (ruled, perforated), the single decorative element.
- **Stack trims.** Next.js 16.4 (current at build time, not 15). Radix primitives styled directly instead of the shadcn CLI. TanStack Query dropped: the downloads view needs only an EventSource.
- **Free-scan lookup is batched.** archive.org returns `400 UNSUPPORTED_VALUE` for `identifier:(…)` lists past ~50 terms; popular works have hundreds of scans (Pride and Prejudice: 289). The lookup now queries in batches of 40 (max 200 ids), restricted to `mediatype:texts` (some `ia` entries are LibriVox audio), and takes the most-downloaded result.
- **Queue wakes at server start** via `src/instrumentation.ts`, so interrupted downloads resume without opening the Downloads page.
- **Monthly publications** render as a flat issue list; month headings appear only when a month has several issues (dailies, weeklies).
- **Year index** lists every year between the earliest and latest dated item; years with gaps show an empty state.
- **"Select all" for books** isn't offered, since each work needs a scan lookup. It's available for archive.org items (page, month, year).

Acceptance criteria (§15) verified against live archive.org: 1–7 pass. Criterion 5 was checked by hard-killing the server mid-download. After the restart, the partial files resumed on their own and all four files' MD5 checksums matched archive.org.
