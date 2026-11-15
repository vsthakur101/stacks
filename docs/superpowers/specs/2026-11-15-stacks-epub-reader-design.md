# Stacks — EPUB reader

> Status: roadmap #14, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Approaches
| | | |
|---|---|---|
| **A** | **epub.js 0.3.93 (BSD)** | **Chosen**: mature, paginated + scrolled, CFI positions, sandboxed frame |
| B | foliate-js | Modern, but not published as a package; vendoring it is more upkeep |

## Design
- `/reader?file=….epub` opens `EpubReader`: the book's HTML in a sandboxed frame (`allow-same-origin`, no scripts), paginated (spread on wide screens) or scrolled; app colours (ink, paper, accent; follows light/dark); text size 80–160 %; contents panel (C) when the book has one; ← → / PageUp/Down and edge buttons; reading time counted.
- Position: exact CFI saved in `reading_progress.position` (migration 0010) plus thousandths for Continue reading and the Finished shelf.
- Opened from bytes (`fetch` → ArrayBuffer): epub.js mis-resolves chapter paths for a URL without ".epub".
- archive.org's generated EPUBs: their reading order lists a "cover" with no file (epub.js crashes) → such entries are dropped and the rest renumbered; their navigation page is blank and their contents empty → a fresh book starts at the first non-navigation section.
- Library "Read" and item pages prefer PDF, then EPUB, then text.
- Dependency note: epub.js pulls `@xmldom/xmldom` 0.7 (high advisory; unused in browsers, which have DOMParser) → `overrides` pins the patched 0.8.15.
