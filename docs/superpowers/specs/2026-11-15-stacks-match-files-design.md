# Stacks — match your own files

> Status: roadmap #11, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Approaches
| | | |
|---|---|---|
| A | Rename the file to "… [identifier].ext" | Everything else works unchanged, but renames the owner's files and every stored path (notes, progress, text) would need re-keying |
| **B** | **A link table; the folder scan applies it** | **Chosen**: files untouched, paths unchanged, undo is one click |

## Design
- `file_links` (migration 0009): file path → identifier, plus name and size so a moved file is found again. The Library scan treats a linked file as part of that item (`linked: true`).
- Other files → **Find on archive.org**: title guessed from the file name (extension, brackets, years, separators, noise words removed); archive.org search: all words in the title, else anywhere, else titles with most of the longer words. Up to 6 candidates; each item's file list is checked for a file of **exactly the same size** (shown, sorted first). The search words are editable (Indic spellings differ: Vibhuti / Vibhoti); a typed search is never overwritten by a late answer.
- **Use this** links (identifier checked against archive.org); the tile then shows **Unlink**.
- Backup includes file links.
- Verified: "Geeta Ki Vibhuti.pdf" (a renamed copy) → no match for the guess; "Geeta Ki Vibhoti" → in.ernet.dli.2015.546816 with same file size → linked, joined the item; unlinked back to Other files.
