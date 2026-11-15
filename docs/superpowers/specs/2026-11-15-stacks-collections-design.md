# Stacks — collections in the Library

> Status: roadmap #7, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Design
- `collections` + `collection_members` (migration 0007). A member is `item:<identifier>` (a Stacks item) or `file:<path>` (an Other file); one thing can be in several collections.
- Library tiles and Other-file rows: **Add to collection** popover (tick collections; "New collection" creates and adds in one step); the label shows "In 2 collections".
- Library filter bar: **Collection** menu (shown once a collection exists, with counts). With one selected: its name with **Rename** and **Delete collection** (confirmed; the books stay).
- Names are unique (case-insensitive), up to 80 characters.
- Backup now also carries collections, their members and reading time (`reading_days`; on restore the larger count for a day wins).
