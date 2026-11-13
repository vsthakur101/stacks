# Stacks — multi-volume sets

> Status: owner chose "Multi-volume sets", then "Group in results" (2026-11-14). Short design.

## Why

The owner's reading is full of sets: the Mahabharata (6 volumes), Valmiki Ramayan (Part 1, 2…), the Puranas (Siva Purana Part 1–4 of 4). They show up as separate, often identically titled items ("Mahabharata" ×6).

## What archive.org gives us (recon 2026-11-14)

- A `volume` field on a few items only (e.g. Toronto's `mahabharata01ramauoft`…`06`).
- Mostly the volume is in the title, in many styles: "Part I", "Part 2", "Part -4", "Part 1 of 4", "Vol-V", "Khand Three".
- Several uploaders publish different editions under near-identical titles ("Valmiki Ramayan Part 1/2" from Gita Press, DLI and others). Title alone would mix editions.
- Volumes uploaded together share an identifier pattern: `SivaPuranaJ.L.ShastriPart1`…`Part4`, `HindiBookValmikiRamayanPartIByGitaPress`/`PartII…`.

## Approaches

| | Where sets appear | |
|---|---|---|
| A | Item pages only (panel + "Add all"); results untouched | safest |
| **B** | **Grouped in search results** (one card per set), plus set page | **Chosen by owner** |

## Design

**Detection** (`catalog/volumes.ts`):
- An item is a *volume* only if archive.org's `volume` field is set, or its title carries a volume marker (part, pt, vol, volume, book, khand/khanda/kand, bhag, खण्ड/खंड, भाग, "N of M") with a number (digits, Devanagari digits, Roman numerals, or words one–twenty).
- Its *stem* is its identifier with the volume token replaced by a placeholder (`SivaPuranaJ.L.ShastriPart{n}`, `mahabharata{n}ramauoft`).
- Items group when they share a stem and have different volume numbers. A shared title alone never groups (different editions stay apart).
- Applies to Books › All scans, Government, Manuscripts, and those groups in global search. Not Newspapers or Magazines (issues aren't volumes; they have issue ledgers). Catalogued books (Open Library) are already grouped by work.

**Results:** a set replaces its volumes with one stacked-cover card: base title, "4 volumes", the range ("Parts 1–4"). Volumes of a set on other result pages aren't merged into this page; the set page finds them.

**Set page** `/set/<stem>`: queries archive.org for every identifier matching the stem (wildcard), applies the same rules, lists volumes in order with cover, label and date, and **Add all N to selection** (in volume order). Each volume links to its item page.

**Escape hatch:** a **Volumes** menu in the filter bar: Grouped (default) / Each separately (`sets=off`).

**Reader:** on a volume's last page, **Next volume** appears when the next volume (same stem, number + 1) is in the Library with a readable file. Local only, no network.

## Calls made
- Conservative matching (stem + volume evidence) over catching every set.
- Sets limited to the sections above.
- Next volume needs the next volume downloaded; the reader doesn't fetch online volumes.

## Implementation notes (2026-11-14)

- **Grouping uses each set's full membership**, not only the volumes on the current page: archive.org's ranking spreads volumes across pages ("siva purana" put only Part 4 on page 1). One cached lookup per distinct set, at most 10 per page.
- **Random upload codes:** many uploads start with a four-character code that differs for every volume (`mWJT_mahabharata-vol.-2-…`, `NiAC_…vol.-3-…`). A stem whose remainder is 20+ characters treats that code as interchangeable (`~` in the stem, five single-character wildcards in the lookup).
- Set lookups don't escape the (already restricted) stem characters: escaped hyphens next to `?` wildcards made archive.org's backend fail.
- Verified live: Siva Purana (4 volumes, parts 1–4) and the M.N. Dutt Mahabharata (6 volumes, 2–7) group; Valmiki Ramayan and Vishnu Purana results come from different uploaders and stay separate.
