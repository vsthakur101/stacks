# Stacks — copy to an e-reader

> Status: roadmap #15, built in the "add all one by one" run (2026-11-15). Owner chose **copy to a plugged-in device** (no email, no accounts). Short design; other calls are mine.

## Design
- Devices: ejectable volumes under `/Volumes` (`diskutil info` says Ejectable/Removable or not Internal; the startup disk symlink is skipped). Kindle = `documents/` + `system/` (or a Kindle-named volume), books into `documents/`; Kobo = `.kobo/`, books at the root; others into `Books/` if present, else the root.
- Library: a line says which device is plugged in; each tile and Other-file row gets **Send to <device>**. For an item the best file is chosen per device (PDF first; a Kindle never gets an EPUB unless it can be converted).
- USB Kindles can't open EPUB: with Calibre installed (`ebook-convert`), EPUB → AZW3 on the way; otherwise a clear message (install Calibre, or use the PDF).
- Copies via a temporary name then rename; a file of the same size already there is skipped; free space checked. Mac-only (refused through phone access).
- Tests: `STACKS_VOLUMES` points at stand-in volumes.
