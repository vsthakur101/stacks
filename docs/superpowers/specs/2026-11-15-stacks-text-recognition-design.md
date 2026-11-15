# Stacks — better text for poor scans (offline text recognition)

> Status: roadmap #16, built in the "add all one by one" run (2026-11-15). Owner chose **offline on this Mac**, with a quality test on Bhavrog first. Short design; other calls are mine.

## Quality test (2026-11-15)
- Engine: **Apple Vision** (`VNRecognizeTextRequest`, accurate); this macOS lists `hi-IN` and `mr-IN` (Devanagari). No install; free; offline.
- Bhavrog (Geeta Press, 1976; no text layer at all): page 61's Sanskrit verse came out "अभिवादनशीलस्य नित्यं वृद्दोपसेविनः । चत्वारि तस्य बर्धन्ते आयुर्विद्या यशो बलम् ॥" (two letter slips); Hindi prose clean apart from old-typeface confusions (खभाव/स्वभाव).
- Speed: one-time warm-up (~25 s), then ~0.15 s a page; the whole 180-page book in under a minute.

## Design
- `scripts/ocr/stacks-ocr.swift`: renders pages with PDFKit (2400 px), Vision with `hi-IN,en-US`, one JSON line per page with line boxes (page fractions). Compiled on first use with `xcrun swiftc` into `data/bin/stacks-ocr` (rebuilt when the source is newer); needs the Command Line Tools (the error says how to install them).
- Queue, one book at a time; progress (page N of M); Stop. Results replace the book's stored text (`book_texts.source = 'ocr'`, migration 0011; one item per recognised line), so Find, Library search, Contents from headings, Go to verse use it; Read aloud reads it (`/api/book/page`). If the file changes, its own text layer is read again.
- Reader → Contents → **Text recognition** (status, Recognise the text / Recognise again, progress, Stop); Find points there for scans without text.
- Not changed: the selectable text layer and highlight capture still use the PDF's own text.
