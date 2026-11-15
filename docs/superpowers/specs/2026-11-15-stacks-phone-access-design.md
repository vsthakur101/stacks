# Stacks — phone access (Tailscale + password) and OPDS

> Status: roadmap #13, built in the "add all one by one" run (2026-11-15). Owner chose **Tailscale + password** (not home Wi-Fi). Short design; other calls are mine.

## Design
- **Off by default.** Settings → Phone access: Tailscale status, a Stacks password (≥ 8 characters; scrypt hash + per-password session secret in `settings.remoteAuth`, excluded from backups), and an on/off switch.
- **A second door, not a wider server.** The main server stays on 127.0.0.1. When on, Stacks opens an HTTP listener on this Mac's **Tailscale address only** (first IPv4 in 100.64.0.0/10; port 3443; re-checked every minute) that forwards to the local server as if from the Mac.
- **Sign-in:** browsers get a small sign-in page and a signed 30-day cookie (HttpOnly, SameSite=Lax); reading apps send the password with HTTP Basic auth. 10 wrong tries per address per 10 minutes. A new password signs every device out.
- **Protections:** answers only to its address or Tailscale names (`*.ts.net`, short machine names) against DNS rebinding; rewrites only its own Origin, so cross-site posts are still refused by the local server's guard; Mac-only actions (`/api/open`, `/api/reveal`) and changing phone-access settings refused remotely.
- **OPDS 1.2** at `/opds`: navigation (Recently added, Everything by title, sections, collections) and acquisition feeds (cover, thumbnail, PDF/EPUB/TXT/DjVu/MOBI links via `/api/file?…&download=1`), OpenSearch search. Root-relative links work through the door and on the Mac.
- Tests: `STACKS_REMOTE_BIND` / `STACKS_REMOTE_PORT` put the door on a local address. Verified end to end (12 checks: sign-in redirect, 401 for apps, wrong password, cookie session, Basic auth OPDS + 23 MB download, Mac-only 403s, remote position save, cross-site 403, wrong host 421).
- Not done here: Tailscale isn't installed on this Mac yet; the owner installs it (Mac + phone, same account).
