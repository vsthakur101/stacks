# Stacks — online page reader

> Status: roadmap #17, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Recon (2026-11-15)
- archive.org IIIF: `iiif.archive.org/iiif/3/<id>/manifest.json` lists canvases with an image service per page. ~2.5 s with `Accept: */*` but **~20 s with `Accept: application/json`** (same 378 KB document).
- Page images `…/full/<w>,/0/default.jpg`: ~1–3 s each; some pages slow (30 s+). IIIF 3 **refuses to enlarge** (400) when the width asked exceeds the page's own width.
- BookReader's JSIA endpoint answered 404/400; not used.

## Design
- `/read/<id>` (Read on item pages for books not downloaded) opens `OnlineReader` in Stacks' theme: whole page / fit width, zoom, ← → / Space / Home / End, click left/right third, page slider, archive.org's viewer one click away for the current page; last page kept in this browser.
- `/page-image/<id>/<n>?w=` serves pages from a disk cache (`data/pages`, 1 GB, least recently used dropped) and fetches the next two pages ahead; widths 800/1200/1600/2000 chosen from the screen, never above the page's own; 35 s timeout with a "Try again" in the reader.
- Manifest cached a week. Items without page images get a plain message and a link to archive.org.
- The old embedded archive.org viewer (and its dark top bar component) is gone.
