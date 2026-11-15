# Stacks — read aloud

> Status: roadmap #6, built in the "add all one by one" run (2026-11-15). Short design; calls are mine.

## Approaches
| | | |
|---|---|---|
| **A** | **Browser speech synthesis (the Mac's own voices: Lekha hi-IN, en-IN…)** | **Chosen**: offline, free, no setup |
| B | Server-side `say` command → audio files | Same voices, but files, latency and a player to build |
| C | Cloud TTS (better Sanskrit) | Costs money; sends text out |

## Design
- Reader toolbar **Read aloud** (A): reads the current page sentence by sentence (split at । ॥ . ? ! or ~220 characters; Chrome cuts long utterances), marks the sentence on the scan, turns the page at the end and carries on. Pages without readable text are announced and skipped.
- Voice from the page's script: Devanagari → Hindi (Lekha; no Mac voice speaks Sanskrit), otherwise English (en-IN first). Voice picker per script remembered in localStorage; speed 0.75–1.5×; pause/resume; Stop closes the bar.
- Spoken text drops page/verse numbers and OCR debris; dandas stay as pauses.
- Needs a text layer (most archive PDFs); scans like Bhavrog have none.
- Implementation notes: support detected after mount (hydration); pressing A before the PDF has loaded starts reading when it arrives; a generation counter ignores callbacks from cancelled speech. The built-in browser pane exposes voices only after `voiceschanged`.
