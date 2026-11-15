# Stacks — backup and restore

> Status: owner asked to build the whole remaining roadmap one by one (2026-11-15); this is #1. Short design; calls are mine unless noted.

## Why
Highlights, notes, named bookmarks, printed-page offsets and reading positions now live only in `data/stacks.db`. One bad disk or a deleted `data/` folder loses them.

## Approaches
| | | |
|---|---|---|
| **A** | **One JSON file (download) + merge on restore + daily copies in the download folder** | **Chosen**: portable, readable, survives a lost `data/` |
| B | Copy the SQLite file | Simple, but restore replaces everything (loses newer notes) and includes caches |

## Design
- **Included:** annotations, reading progress, book prefs, Home shelves, search history, settings. **Left out:** caches (archive responses, extracted book text, covers), download history.
- **Download** in Settings → Backup: `stacks-backup-YYYY-MM-DD.json` (`GET /api/backup`).
- **Restore** (`POST /api/backup`): validated with zod (app, version); merges: missing rows added, newer `updatedAt` wins, nothing deleted; settings only filled where unset (they describe this Mac). Summary shown ("3 added highlights, notes and bookmarks…").
- **Daily copies:** while the server runs (started from `instrumentation.ts`), one copy a day in `<download folder>/.stacks-backups/`, newest 30 kept; the Library scan ignores dot folders. "Show in Finder" in Settings.
