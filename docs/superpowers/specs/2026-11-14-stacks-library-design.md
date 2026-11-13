# Stacks — My library

> Status: approved by owner 2026-11-14 ("My library page", then "Yes, show them" for other files). Short design.

## Why

Downloading is the core of Stacks, but once files land in the download folder there's no way back to them in Stacks except the Downloads list. Recon found worse: **Clear finished** deletes download jobs and with them Stacks' only record of what it fetched. The owner's 4 downloaded PDFs were on disk but unknown to Stacks, so their "Downloaded" ticks had already vanished.

## Approaches

| | Source of truth | Trade-off | |
|---|---|---|---|
| A | **The download folder** (scan; recognise Stacks files by `[archive-id]` in the name or parent folder) | Survives clearing history and moving files within the folder; sees files Stacks didn't download | **Chosen** |
| B | Download history in SQLite | Simple, but loses everything on Clear finished and misses moved files | rejected |

## Design

- `/library`, linked in the header before Downloads. One page, works in all three themes.
- **Scan:** walk the download root (no symlinks, skip hidden files, `.part`, `.tmp`). A file belongs to an item if its name, or its folder's name (multi-file items), ends in `[identifier]`. The top-level folder gives the section. Files without an identifier are **Other files**. The scan is cached for a few seconds.
- **Details** (title, date, language, cover) come from the cached item metadata; if unavailable, the title comes from the file name.
- **Filters** in the standard filter bar: Section, Language (archive.org's spellings mapped to the language list; unmapped → Other or unknown), Sort (Recently added, Title, Size). A search box filters by title and file name.
- **Each item:** cover, title, format and size; buttons **Open** (the file, or the folder when there are several) and **Show in Finder**; the title links to the item page.
- **Other files:** a short list (name, size, Open, Show in Finder).
- **No delete** in this version: removing files stays in Finder.
- The "Downloaded" ticks and the item page's Open/Show buttons use the same scan (plus download history), fixing the vanished ticks.
- Opening a file from Library only accepts paths the scan found inside the download root.

## Calls made
- Sort default: Recently added.
- Other files listed below the grid, collapsed into a simple list.
