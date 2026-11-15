# Stacks — search inside your books (Library)

> Status: roadmap "new" item, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Why
Find works inside one book. Across the Library ("which of my books has this verse?") it needs one search over every downloaded PDF, offline.

## Approaches
| | | |
|---|---|---|
| A | Run Find's matcher over every page of every book per search | Close matches across a library: seconds per search |
| B | SQLite FTS5 | Word tokens: OCR's broken and merged words would miss |
| **C** | **Normalised page text stored once; `instr()` scan in SQL; snippets in JS for matching pages** | **Chosen**: milliseconds, same normalisation as Find |

## Design
- `book_text_pages.norm` (migration 0005): page text normalised like Find (no spaces/punctuation/nukta, digits unified). Filled at extraction; older rows backfilled on search.
- Background reading: one PDF at a time (≤ 300 MB), 2 min after start and every 30 min (`instrumentation.ts`); the search page also starts it and says how many books are read so far.
- `/library/inside?q=`: exact matches only (close matches stay in Find), grouped by book, most matches first, up to 3 snippets per book with page; links open the reader at that page with Find pre-filled. Linked from the Library ("Search inside your books"), and to archive.org's search (`/inside`).
- Roman queries always also search their Devanagari form (an extra exact needle; "Raghu" is in the English word list, so the Indic-word check would skip it).
- Queries of ≤ 4 letters must start a word (also in Find): ignoring spaces otherwise lets "रघु" match across "फिर घुनके".
