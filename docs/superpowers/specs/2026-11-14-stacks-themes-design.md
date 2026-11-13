# Stacks — three switchable themes (Catalogue, Reading, Poster)

> Status: owner chose "New look", then "Switchable themes in the app" for all three directions (2026-11-14). Replaces the Pothi look.

## Why

Owner found Pothi "too old-fashioned" (old-style serif, double rules, paper tone, palm-leaf slip). Audit with the UI/UX Pro Max and Frontend Design skills also found clutter: on a phone, search results started ~840 px down below four rows of controls; and four accessibility gaps.

## Approaches

| | Direction | Chosen |
|---|---|---|
| A | **Catalogue**: modern museum catalogue. White, deep blue-black ink, one ultramarine accent, Anek condensed headlines, square covers, strict grid, slim selection bar | default |
| B | **Reading**: app-like (Apple Books / Libby). Soft grey with white panels, rounded covers with shadows, Noto Sans Devanagari, teal accent, floating selection pill | yes |
| C | **Poster**: modern Indian graphic design. Each section owns a colour; huge extra-condensed headlines in colour bands | yes |

Owner chose all three as themes switchable in Settings. Pothi is retired.

## Theme mechanics

- `data-theme="catalogue|reading|poster"` on `<html>`, from a `stacks-theme` cookie read in the root layout (no flash on load). Default: catalogue.
- Each theme defines the same semantic tokens (light and dark): `paper`, `raised`, `ink`, `ink-soft`, `ink-faint`, `rule`, `accent`, `accent-ink`, `accent-wash`, `danger`, plus fallback-cover colours and title typography.
- Components use only semantic tokens and a small set of theme hook classes: `font-display` (page and section headings), `font-title` (item titles), `t-wordmark`, `t-cover`, `t-fallback`, `t-tray`. All theme differences live in `globals.css`; no page has three versions.
- Poster: the current section sets `data-section` on `<html>` (client, on navigation), which picks the section colour. Fill and text-safe variants per section (marigold is fill-only on white: 2.0:1; text uses `#8A5A00`).

## Tokens (contrast checked, WCAG 2)

| | Light paper / ink / faint / accent | Dark paper / ink / faint / accent |
|---|---|---|
| Catalogue | `#FFFFFF` / `#141A33` / `#5D6379` (5.96) / `#2D3BFF` (6.60) | `#0D1020` / `#EEF0F7` / `#959BB2` (6.84) / `#8F99FF` (7.35) |
| Reading | `#F2F2F5` (panels `#FFFFFF`) / `#1C1C22` / `#62627A` (5.30) / `#0A7268` (5.19) | `#121214` (panels `#1C1C20`) / `#F2F2F5` / `#9C9CA8` (6.89) / `#4FD1C0` (9.99) |
| Poster | `#FFFFFF` / `#111111` / `#5E5E66` (6.42) / section colour | `#141414` / `#F4F4F2` / `#A0A09A` (7.01) / section colour |

Poster section colours, light: Books `#2337D6`, Newspapers `#C8361B`, Magazines `#F2A900` (fill only), Government `#0E7347`, Manuscripts `#7A2E73`. Dark: `#8E9BFF`, `#FF8A6E`, `#F7C04A`, `#5FD39A`, `#E28AD6`.

**Type:** Anek Devanagari (variable width 75–125, weight 100–800) for Catalogue and Poster; Noto Sans Devanagari for Reading. Both cover Latin and Devanagari. Catalogue headings: width 82, weight 650. Poster headings: width 75, weight 780, very large. Reading headings: weight 650, normal width.

## Shared structural changes (all themes)

1. **One filter bar** replaces the stacked rows: `Language ▾  Order ▾  Source ▾  Books ▾  Spellings ▾`. Menus are `<details>` dropdowns on desktop and bottom sheets on phones; the bar scrolls sideways on phones instead of wrapping. Results begin right after search box + one line.
2. **Selection** (formerly "Call slip"): the theme decides the trigger (Catalogue: slim full-width bar; Reading: floating pill; Poster: block in section colour); the panel is a right drawer on desktop and a bottom sheet on phones.
3. **Accessibility:** faint text ≥ 4.5:1 in every theme; pointer cursor on all buttons and menu triggers (Tailwind v4 default dropped it); cover + button 44 px on touch screens; no text under 12 px.

## Calls made
- Default theme Catalogue (recommended in the directions).
- Light/dark still follows the system in every theme.
- "Call slip" renamed "Selection" (the library-slip metaphor belonged to Pothi).
