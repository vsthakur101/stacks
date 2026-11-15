# Stacks — search inside books

> Status: roadmap #1, built as part of "add all one by one" (2026-11-15). Short design; calls are mine.

## Recon (2026-11-15)
- `GET https://be-api.us.archive.org/ia-pub-fts-api?q=…&size=&from=` (Elasticsearch-style; used by the official Python client). Devanagari works ("धर्मक्षेत्रे कुरुक्षेत्रे": 1,301 books). Matches arrive as passages with `{{{word}}}` marks.
- Takes 3–12 s. `page_num` is null for most hits (3 of 20 had one).
- Filters in the query string work: `meta_mediatype:texts`, `meta_languageSorter:("Hindi")`, `NOT …` for Other/unknown; phrases in quotes.
- DLI scans (`in.ernet.dli…`) are not in the full-text index.

## Approaches
| | | |
|---|---|---|
| A | A group inside the existing /search page | Its 10 s wait would hold up the summary line |
| **B** | **Separate /inside page, linked both ways from /search** | **Chosen**: streams on its own, its own filters (Words) |

## Design
- `/inside?q=&lang=&phrase=1&page=`: language filter (same menu as search), **Words: All words / Exact phrase**. Romanised Indic words also search their Devanagari form (Google Input Tools), shown in the summary.
- Results: cover, title, creator/year/language, up to 3 passages with matches marked, **add to selection**, **Read here** for downloaded books (our reader, at the page when known, with Find pre-filled via `?find=`), **Open on archive.org** (at the page when known, with `?q=` so its viewer searches too).
- "Searching…" state explains the wait; results cached 1 hour; 20 per page, 50 pages max.
- Reader: `?find=` opens Find with the query; new Find results start at the first exact match on or after the current page.
