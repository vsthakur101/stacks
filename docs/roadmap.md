# Stacks — feature roadmap

> Researched 2026-11-14. Recommendations for a personal, local reading tool focused on Indic texts (Geeta Press, Mahabharata, Puranas, Sanskrit), with bulk downloads. Effort: **S** ≈ a few hours, **M** ≈ a day, **L** ≈ several days.

## What Stacks already does

Search across Open Library and archive.org (every spelling incl. Devanagari, 15 languages + Other/unknown, sort, archive-wide scans) · sections for newspapers, magazines, government, manuscripts with issue ledgers · item, author, subject pages · bulk selection and downloads (formats, resume, md5, skip existing) · My library built from the download folder · reader for downloaded PDFs and text (remembers the page, Continue reading) · multi-volume sets grouped in results · recent and saved searches · three themes · streaming pages, caches, cover cache.

## Research summary

**Comparable tools.** Offline readers (KOReader) lead on highlights/notes, dictionary lookup, reading statistics and progress sync. Library managers (Calibre, Calibre-Web, Kavita) lead on metadata editing, collections/tags, format conversion, an OPDS catalogue for phone reading apps, and send-to-Kindle. Study tools (Readwise Reader) lead on highlight export, review of highlights, and text-to-speech.

**Live tests (2026-11-14):**

| Capability | Result |
|---|---|
| archive.org **full-text search** (`be-api.us.archive.org/ia-pub-fts-api`, undocumented but used by the official Python client) | Works, including Devanagari: "धर्मक्षेत्रे कुरुक्षेत्रे" → 1,301 books with the matching passage; "computer chess" → 12,026. ~1.7–2.6 s. Each hit has **page_num**, language and collection. |
| archive.org **related items** (`mds/v1/get_related/all/<id>`) | Works: 6 related items for a Pride and Prejudice scan. |
| **Monier-Williams** Sanskrit dictionary (Cologne lexicon API) | Works with Devanagari input: "धर्म" → full entry in ~1 s. |
| **Hindi voice** on this Mac | **Lekha (hi_IN)** is installed, plus English (India) voices: read-aloud can be offline and free. |
| OCR quality for Devanagari | Literature: Tesseract is weakest on degraded Devanagari; Google/LLM-based and Surya are better, no reliable Sanskrit ranking. A local OCR upgrade is research, not a quick feature. |

## Recommended order

### Now — highest value for how you read

| # | Feature | Why it matters for you | Evidence | Effort |
|---|---|---|---|---|
| 1 | **Search inside books** | Find which books contain a shloka, a name or a passage, not just a title. Results show the passage; click opens the book **at that page** (your reader if downloaded, archive.org's viewer otherwise). Works with every-spelling and language filters. | Live: Devanagari full-text works, page numbers included | M |
| 2 | **Find in this book** (reader) | Cmd+F inside a downloaded PDF/text: jump between matches. | pdf.js text layer; archive "Text PDF"s carry OCR text | S–M |
| 3 | **Bookmarks, highlights and notes** | Mark shlokas and passages, add notes, see them all per book and across books; export as Markdown. | Core to KOReader and Readwise | M |
| 4 | **Sanskrit word lookup** | Select a word while reading → Monier-Williams meaning. | Live: Cologne API works with Devanagari | S–M |
| 5 | **Table of contents in the reader** | Jump to a chapter/parva using the PDF's outline (where present). | pdf.js outline API | S |

### Next — organising and reading comfort

| # | Feature | Why | Effort |
|---|---|---|---|
| 6 | **Read aloud** | Listen to Hindi (Lekha) or English text, offline. Needs a text layer (most archive PDFs and all .txt). | M |
| 7 | **Collections and tags** in the Library | Group your own sets ("Puranas", "To read", "Geeta Press") beyond sections. | M |
| 8 | **Related books** on item pages | "More like this" from archive.org. Live-verified. | S |
| 9 | **Watch a search for new uploads** | Saved searches (e.g. Geeta Press, Sanskrit) tell you on Home when new items appear since your last visit. | M |
| 10 | **Reading history and statistics** | Time read, pages per day, books finished; a "Finished" shelf. | S–M |
| 11 | **Match your own files** | "Other files" in the Library get matched to archive.org items (title search) so they get covers, details and sets. | M |
| 12 | **Browser tests** (foundation) | Playwright runs of search → select → download → Library → reader, in all three themes. Catches the regressions that kept turning up during manual checks. | M |

### Later — bigger or situational

| # | Feature | Why | Effort |
|---|---|---|---|
| 13 | **Phone access** (Tailscale + sign-in) and an **OPDS catalogue** | Read on your phone, and browse the Library from reading apps (KOReader, Readest, Moon+). Requires opening the local-only server safely. | L |
| 14 | **EPUB reader** | Once your Library has EPUBs. | M |
| 15 | **Send to Kindle / e-reader** | Email or copy downloads to a device; convert where needed. | M |
| 16 | **Better text for poor scans** | Re-run OCR on downloaded scans whose Devanagari text is unusable (Surya or an LLM service), to improve search, find and read-aloud. Needs a quality test on your own pages first. | L |
| 17 | **Online page reader** | Read scans you haven't downloaded, in your theme, with caching (archive pages take 3–8 s each). | L |
| 18 | **Backup and restore** | Export reading progress, notes, shelves and history. | S |
| 19 | **Download scheduling and limits** | Run large downloads overnight, cap bandwidth; show disk usage. | S–M |

### Not recommended (for now)

- **AI chat about books**: sends your reading to a third-party service, costs money, and Devanagari OCR text is often too noisy to answer reliably.
- **Social features, accounts, sharing**: Stacks is personal.
- **Audio and video sections**: outside your focus on written material.

## My top five

1. Search inside books
2. Bookmarks, highlights and notes
3. Find in this book + table of contents (small, pairs well with 2)
4. Sanskrit word lookup
5. Browser tests, before the feature count grows further

## Sources

[KOReader wiki](https://github.com/koreader/koreader/wiki/) · [KOReader v2025.08 release](https://newreleases.io/project/github/koreader/koreader/release/v2025.08) · [Top 10 KOReader features](https://www.analyticsinsight.net/books/top-10-koreader-features-every-e-book-reader-should-know) · [Calibre: what's new](https://calibre-ebook.com/whats-new) · [Calibre (Wikipedia)](https://EN.wikipedia.com/wiki/Calibre_(software)) · [Readwise Reader](https://readwise.io/read) · [Readwise Reader review](https://www.asianefficiency.com/productivity/readwise-reader-review/) · [Kavita vs Calibre-Web](https://selfhosting.sh/compare/kavita-vs-calibre-web/) · [Best self-hosted ebook servers 2026](https://selfhosting.sh/best/ebooks-reading/) · [Audiobookshelf vs Kavita vs Calibre-Web](https://www.pistack.xyz/posts/2026-04-19-audiobookshelf-vs-kavita-vs-calibre-web-self-hosted-ebook-audiobook-server-2026/) · [archive.org search guide (full-text search)](https://help.archive.org/help/search-a-basic-guide/) · [python-internetarchive search.py](https://sources.debian.org/src/python-internetarchive/5.7.0-1/internetarchive/search.py) · [Cologne Sanskrit lexicon guides](https://sanskrit-lexicon.github.io/csl-guides/tools/multi-dictionary) · [C-SALT APIs](https://dh-abstracts.library.virginia.edu/works/9981) · [Indic OCR benchmark (IIIT Hyderabad)](https://arxiv.org/html/2205.06740v2) · [Hindi OCR with VLMs](https://hindiocr-vlm.github.io) · [EdgeSanskrit-TTS](https://huggingface.co/Hari7718/EdgeSanskrit-TTS) · [Offline TTS on Mac](https://voice-private.pages.dev/blog/offline-text-to-speech-mac/)
