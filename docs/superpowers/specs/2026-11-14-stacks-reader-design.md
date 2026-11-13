# Stacks — reader for downloaded files

> Status: owner chose "Our own reader", then "Downloaded files", then approach A (2026-11-14). Short design.

## Why

Reading used archive.org's embedded viewer: online-only, unthemed, and it can't remember a place. Recon: archive.org's IIIF page images work but take 3–8 s per page (manifest 4.5–6.4 s), while downloaded files open instantly offline. The owner mostly reads downloaded files; the Library holds 4 PDFs today.

## Approaches

| | | |
|---|---|---|
| **A** | **Own reader on pdf.js** (v6.5): themed, keyboard, remembers the page, Continue reading on Home; plain text too | **Chosen** |
| B | Browser's built-in PDF viewer in the page | Almost free, but unthemed and Stacks can't know the page |
| C | Open in Preview | Already exists (Open) |

## Design

- **URL:** `/reader?file=<path inside the download folder>`. The path must be one the Library scan found; anything else is "not found".
- **File serving:** `GET /api/file?file=…` streams the file with HTTP Range support (pdf.js fetches large PDFs in pieces, so a 140 MB magazine opens at once). Same path check; loopback only.
- **PDF:** pdf.js loaded only on the reader page (worker served from `/pdf-worker`). One page at a time on a canvas, sharp on Retina; the next and previous pages are pre-rendered so turning is instant. Whole page (default; fit-to-width made desktop pages ~1,400 px wide) / fit width; zoom 50–300 %.
- **Plain text** (`.txt`, archive.org's OCR text): rendered as reading text in the theme's type; the scroll position is remembered.
- **Controls:** a thin top bar (back, title, page *n* of *N*, fit, zoom) and a page scrubber at the bottom. Keys: ← → / PageUp PageDown / Space to turn, Home/End, + − 0 for zoom. Click or tap the left/right third of the page to turn.
- **Position:** `reading_progress` table (file path → page, total, updated). Saved as you read (debounced); the reader reopens at the saved page.
- **Continue reading** row on Home: the last 6 files read whose files still exist, with cover, title and "page *n* of *N*".
- **Entry points:** Library tiles get **Read** when the item has a PDF or text file; the item page's Read uses the downloaded file when there is one, otherwise archive.org's viewer as before.
- Themes: the reader uses the theme tokens; header and selection bar are hidden on the reader.
- Out of scope now: EPUB (none in the Library yet), DjVu and page-image ZIPs (still open in the default app), annotations.
