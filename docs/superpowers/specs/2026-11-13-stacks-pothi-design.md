# Stacks — "Pothi" visual redesign

> Status: direction chosen by owner 2026-11-13 ("Go with Pothi"). Short design (visual layer only; no data/feature changes except the Devanagari search fix).

## Intent

The phase-1 look was clean but generic, broke on Devanagari (Spectral has no Devanagari glyphs), and read as "a lot of rectangles". The owner reads a lot of Indic material (Geeta Press, Mahabharata); archive.org holds ~1.4M Hindi and ~90K Sanskrit texts. Pothi takes its identity from the manuscripts themselves: real pigments, handmade-paper grounds, the double-rule frames on Indian book covers.

## Approaches considered

| | Direction | Trade-off | |
|---|---|---|---|
| **A** | **Pothi**: paper + indigo ink + vermilion, lamp-black dark, double-rule frames, Tiro + Anek | Most specific to the content; risk of looking generic if paper drifts to cream, so the ground stays near-neutral | **Chosen** |
| B | Lamp-black & orpiment, dark-first, Eczar | Atmospheric at night, weaker light theme | |
| C | Gallery neutrals, Noto + IBM Plex | Safest, least distinctive | |

## Tokens

Colours are named after the manuscript pigments they come from (lamp black, indigo, vermilion, orpiment, gerua, china clay). Contrast was checked with WCAG 2 and APCA (body target Lc ≥ 90, secondary ≥ 75).

| Token | Light | Dark | Use | Light Lc / Dark Lc |
|---|---|---|---|---|
| `paper` (china clay / lamp black) | `#F5F3EE` | `#11131B` | ground | |
| `raised` | `#FBFAF7` | `#191C27` | slip, dialogs, fallback covers | |
| `ink` (lamp black + indigo) | `#1A2036` | `#ECE8DF` | body, titles | 96 / 92 |
| `ink-soft` | `#4A5066` | `#D2CDC3` | secondary text | 81 / 76 |
| `ink-faint` | `#7A7E8E` | `#A29E95` | incidental meta only | 60 / 49 |
| `rule` (gerua-tinged) | `#DAD4C7` | `#2A2D3A` | hairlines, frames | |
| `vermilion` (sindoor) | `#B5321C` | `#F79A80` | the one accent: selection, primary actions, active nav | 72 / 60 |
| `on-vermilion` | `#FFFFFF` | `#11131B` | text on accent | 85 / 62 |
| `indigo` | `#2C3A7A` | `#B5BEEA` | fallback-cover field, links in prose | 87 / 68 |
| `orpiment` | `#C8901A` | `#E2B04A` | count badge on the slip only | |

Pure white text is never used in dark mode (halation); dark ground is indigo-tinted, never neutral `#111`.

**Type**
- **Tiro Devanagari Hindi** (Tiro Typeworks; Latin + Devanagari, regular + italic): titles, headings, reading text, wordmark.
- **Anek Devanagari** (Ek Type; variable weight/width, Latin + Devanagari): all interface text.
- Line height: 1.75 for reading text, 1.25 for headings (Devanagari matras clip at Latin-tight leading), 1.5 UI.

**Motif:** the double rule (`3px double`) of Indian book covers and pothi frames. Used in exactly three places: header base, fallback covers, the call slip.

## Layout fixes (all eight from the audit)

1. Devanagari renders in both fonts; Devanagari search works (bug: query sanitizer stripped combining vowel signs `\p{M}`, so "गीता" became "गत").
2. Fallback cover = a designed pothi cover (indigo field, inset double frame, centred title); the + button never covers text.
3. "Unknown author" removed; show nothing when there's no author.
4. Container widens to 1440px; grid is `auto-fill, minmax(168px, 1fr)`, so covers grow on wide screens.
5. Active nav = vermilion underline, not a bright pill; the content is the brightest thing on the page.
6. Free / borrow-only is a two-option segmented control.
7. Dark theme gains a raised surface for the slip and fallback covers.
8. Home gets curated shelves, including Indic ones (Bhagavad Gita, Mahabharata & Ramayana, Sanskrit), so it isn't only rectangles of search results.

## Calls made (owner may override)
- Hero copy stays English; the search placeholder shows both scripts ("महाभारत, Pride and Prejudice, BYTE 1985").
- Home shelves chosen by me; they live in one config array.
- Call slip keeps its name; it becomes a leaf with a binding hole when collapsed.
