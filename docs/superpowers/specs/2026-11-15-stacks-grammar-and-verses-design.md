# Stacks — verb lookup (Sanskrit grammar) and jump to verse

> Status: roadmap "new" items, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Verb lookup
- **Recon:** INRIA's Sanskrit Heritage Reader Companion (`sanskrit.inria.fr/cgi-bin/SKT/sktreader.cgi`, Gérard Huet) splits sandhi/compounds and gives each part's dictionary form and grammar, verbs included: किमकुर्वत → किम् + अकुर्वत (कृ, imperfect, 3rd plural); गच्छति → गम्. Input must be a Roman scheme (SLP1 works; Devanagari is rejected), 1–1.3 s.
- **Design:** Devanagari → SLP1 (`shared/slp1.ts`); Look up runs the analysis alongside Monier-Williams and Wiktionary; the best solution (first listed; not always numbered 1) becomes a **Grammar** section (form, dictionary form as a link, tags glossed in English: case, number, gender, tense, person, voice). Dictionary forms MW didn't reach are looked up there ("from its grammar"); when grammar succeeds, MW's guesses (closest headword, compound prefix) are dropped. Cached 30 days; only the word is sent. Note shown: "ignore it for a Hindi word".

## Jump to verse
- Contents → **Go to verse**: "47" finds the next "॥ ४७ ॥" from the current page (wrapping); "2.47" searches chapter 2, chapters being the book's bookmarks in page order (Contents from headings creates them), plus the next chapter's first page.
- Marker matched in its OCR forms: ॥ / ।। / || / | around Devanagari or ASCII digits; a bare "(४७)" doesn't count.
- Messages say what's missing ("Chapter 3 needs a bookmark at its start…", "No ॥ १० ॥ found in chapter 9 (pages 210–237)").
