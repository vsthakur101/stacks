import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LibraryFile } from './library/scan';

const run = promisify(execFile);

/**
 * Copy to an e-reader plugged into the Mac by USB. Devices are ejectable volumes under /Volumes;
 * Kindles and Kobos are recognised by their folders. USB Kindles can't open EPUB: Calibre's
 * ebook-convert (if installed) turns EPUB into AZW3 on the way, otherwise Stacks says so.
 */

export type DeviceKind = 'kindle' | 'kobo' | 'other';

export interface Device {
  /** Volume name, e.g. "Kindle". */
  name: string;
  kind: DeviceKind;
  /** Folder books go into, relative to the volume. */
  folder: string;
  freeBytes: number | null;
}

const VOLUMES = () => process.env.STACKS_VOLUMES ?? '/Volumes';
const CALIBRE = '/Applications/calibre.app/Contents/MacOS/ebook-convert';

/** Formats each kind of device opens from a USB copy. */
const OPENS: Record<DeviceKind, ReadonlySet<string>> = {
  kindle: new Set(['pdf', 'txt', 'mobi', 'azw3', 'azw']),
  kobo: new Set(['epub', 'pdf', 'txt', 'cbz', 'kepub']),
  other: new Set(['epub', 'pdf', 'txt', 'mobi', 'azw3', 'djvu', 'cbz']),
};

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

async function isEjectable(mount: string): Promise<boolean> {
  if (process.env.STACKS_VOLUMES) return true; // test folders stand in for devices
  try {
    const { stdout } = await run('diskutil', ['info', '-plist', mount], { timeout: 4000 });
    return /<key>(Ejectable|Removable)<\/key>\s*<true\/>/.test(stdout) || /<key>Internal<\/key>\s*<false\/>/.test(stdout);
  } catch {
    return false;
  }
}

export async function listDevices(): Promise<Device[]> {
  const root = VOLUMES();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: Device[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const mount = path.join(root, name);
    const stat = await fs.lstat(mount).catch(() => null);
    if (!stat?.isDirectory()) continue; // the startup disk is a symlink to "/"
    if (!(await isEjectable(mount))) continue;
    let kind: DeviceKind = 'other';
    let folder = '';
    if ((await exists(path.join(mount, 'documents'))) && ((await exists(path.join(mount, 'system'))) || /kindle/i.test(name))) {
      kind = 'kindle';
      folder = 'documents';
    } else if (await exists(path.join(mount, '.kobo'))) {
      kind = 'kobo';
    } else if (await exists(path.join(mount, 'Books'))) {
      folder = 'Books';
    }
    const freeBytes = await fs.statfs(mount).then((s) => s.bavail * s.bsize, () => null);
    out.push({ name, kind, folder, freeBytes });
  }
  return out;
}

export function canConvert(): Promise<boolean> {
  return exists(CALIBRE);
}

export type CopyResult =
  | { file: string; status: 'copied' | 'converted' | 'already-there'; dest: string }
  | { file: string; status: 'unsupported' | 'no-space' | 'failed'; message: string };

const LABEL: Record<DeviceKind, string> = { kindle: 'A Kindle', kobo: 'A Kobo', other: 'This device' };

export async function copyToDevice(device: Device, file: LibraryFile, opts: { convert?: boolean } = {}): Promise<CopyResult> {
  const dir = path.join(VOLUMES(), device.name, device.folder);
  let ext = file.ext;
  let destName = file.name;
  const convert = !OPENS[device.kind].has(ext) && ext === 'epub' && device.kind === 'kindle' && (opts.convert ?? true) && (await canConvert());
  if (!OPENS[device.kind].has(ext) && !convert) {
    const hint = device.kind === 'kindle' && ext === 'epub' ? ' Install Calibre to convert it on the way, or use the PDF.' : '';
    return { file: file.relative, status: 'unsupported', message: `${LABEL[device.kind]} can’t open ${ext.toUpperCase()} files copied by USB.${hint}` };
  }
  if (convert) {
    ext = 'azw3';
    destName = file.name.replace(/\.epub$/i, '.azw3');
  }
  const dest = path.join(dir, destName);
  if (!convert) {
    const there = await fs.stat(dest).catch(() => null);
    if (there && there.size === file.size) return { file: file.relative, status: 'already-there', dest };
  } else if (await exists(dest)) {
    return { file: file.relative, status: 'already-there', dest };
  }
  if (device.freeBytes !== null && device.freeBytes < file.size * 1.1) {
    return { file: file.relative, status: 'no-space', message: `Not enough space on ${device.name}.` };
  }
  try {
    await fs.mkdir(dir, { recursive: true });
    if (convert) {
      await run(CALIBRE, [file.path, dest], { timeout: 10 * 60_000 });
      return { file: file.relative, status: 'converted', dest };
    }
    const tmp = `${dest}.stacks-part`;
    await fs.copyFile(file.path, tmp);
    await fs.rename(tmp, dest);
    return { file: file.relative, status: 'copied', dest };
  } catch (error) {
    return { file: file.relative, status: 'failed', message: error instanceof Error ? error.message : 'Copy failed.' };
  }
}

/** The file an item sends: what the device opens, PDF first; else an EPUB a Kindle can get converted. */
export function bestFileFor(files: LibraryFile[], kind: DeviceKind): LibraryFile | undefined {
  const order = ['pdf', 'epub', 'azw3', 'mobi', 'txt', 'djvu'];
  const sorted = [...files].sort((a, b) => (order.indexOf(a.ext) + 99) % 99 - ((order.indexOf(b.ext) + 99) % 99));
  return sorted.find((f) => OPENS[kind].has(f.ext)) ?? sorted.find((f) => f.ext === 'epub');
}
