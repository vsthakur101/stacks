# Stacks — ease-of-use features (spelling variants, downloaded marks, sort, recent & saved searches)

> Status: owner chose all four on 2026-11-13 and picked Google's transliteration service. Short design.

## Why

The owner searches mostly Indic texts. Measured on archive.org (2026-11-13), one spelling misses a large share of matches: "mahabharata" finds 2,563 of 4,205 (with mahabharat, महाभारत), "ramayana" 3,837 of 6,269, "gita" 11,095 of 14,654. Typing Devanagari on a Mac keyboard is the slowest part of searching. Separately: there's no way to see what's already on disk, archive.org's relevance order is weak, and frequent searches have to be retyped.

## 1. One search, every spelling

Per word of the query (letters only, length ≥ 3):
- **Latin word:** spelling variants from rules (final *a* on/off: mahabharat↔mahabharata; *ee*↔*i*, *oo*↔*u*) and a short alias list (bhagavad/bhagwat, puran/purana, shiv/shiva, krishna/krushna…). Devanagari form from Google Input Tools (`itc=hi-t-i0-und`) **only if** the word isn't an English word (macOS `/usr/share/dict/words`) or is on an "always Indic" list (hanuman, krishna, yoga, karma, veda, purana…), and the language filter is Any or a Devanagari-script language.
- **Devanagari word:** casual Roman forms by local transliteration (with/without final *a*); with/without final halant (उपनिषद्/उपनिषद).
- Max 5 variants per word. Query = AND of words, each an OR of its variants, on both archive.org and Open Library.
- UI: under the search box, "Also searching for" chips, each removable (`x=` param); "Exact spelling only" (`exact=1`).
- Google gets only the individual words, cached 30 days; 3-second timeout; if unreachable, search proceeds with Latin variants only.

Approaches considered: Google (chosen, 11/11 test words correct); built-in vowel-length guesser validated against archive.org counts (got रामायण and उपनिषद् wrong, 8–16 queries per word); no Devanagari conversion.

## 2. Already-downloaded marks

- A scan counts as downloaded when a finished download task exists **and** its file is still on disk.
- Covers get a quiet tick; work tiles count a work as downloaded if any of its scans is.
- Item page: **Open file** (default app) and **Show in Finder**.
- Call slip format step: "N of these are already downloaded."

## 3. Sort

Best match (default), Most read (`downloads desc`), Oldest (`date asc`), Newest (`date desc`), as `sort=read|old|new`. Applies to archive.org results (Books › All scans, section searches, the archive groups in global search). Catalogued books stay best-match: Open Library's sorts ignore relevance ("gita" by readership starts with *Candide*).

## 4. Recent & saved searches

- SQLite: `search_history` (one row per distinct search, last-used time, count) and `saved_shelves` (title, search, position).
- Every results page with a query records itself (page number excluded).
- Home: recent searches as a chip row under the search box (last 8, clearable); saved shelves above the curated ones, each removable.
- "Save as shelf" on Books and section search results. A saved shelf re-runs its search (language, source, sort, spellings included) and shows the first row.

## Calls made
- Variant chips default on; exact mode one click away.
- Devanagari conversion only for Devanagari-script languages (Google's Bengali output was wrong: রামাযান).
- Global search can't be saved as a shelf (it's several groups); its sections can.
