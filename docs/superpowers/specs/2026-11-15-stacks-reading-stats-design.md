# Stacks — reading history and stats

> Status: roadmap #10, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Design
- **Counting** (`useReadingTimer`, both readers): 15 s ticks while the page is visible and there was a key, click, scroll, page turn or speech in the last 2 minutes; new pages reached this visit count as pages read (not the page you open on). Sent every minute and on leaving (`POST /api/reading-time`, ≤ 120 s per call) into `reading_days` (file, local day; migration 0006).
- **Reading page** (`/reading`, linked from the Library): this week / month / year (time, pages, books, days) as hero numbers; a six-month calendar (weeks × weekdays, one-hue accent scale in 5 steps, hover titles, "Less … More" legend, "Show as a list" text alternative); a streak line; most read this year; **Finished** shelf (reading position on the last page, or last 1% of a text).
- Charting choices per the dataviz guidance: hero numbers instead of charts for totals; a single sequential hue; steps spread so the first is distinct from "none" in light and dark themes.
