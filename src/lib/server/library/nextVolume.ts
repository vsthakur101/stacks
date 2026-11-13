import { peekItem } from '../catalog/archive';
import { idStem, parseVolume } from '../catalog/volumes';
import { scanLibrary, titleFromFileName, type LibraryItem } from './scan';

function volumeInfo(item: LibraryItem) {
  const meta = peekItem(item.identifier);
  const title = meta?.title ?? titleFromFileName(item.files[0]?.name ?? item.identifier);
  const info = parseVolume(title, meta?.volume);
  if (!info) return null;
  const stem = idStem(item.identifier, info.n);
  return stem ? { ...info, stem } : null;
}

/** The readable file of the next volume of the same set, if it's in the Library. Local only. */
export async function nextVolumeFile(root: string, identifier: string): Promise<{ relative: string; label: string } | null> {
  const scan = await scanLibrary(root);
  const current = scan.items.find((i) => i.identifier === identifier);
  const info = current ? volumeInfo(current) : null;
  if (!info) return null;
  for (const item of scan.items) {
    if (item.identifier === identifier) continue;
    const other = volumeInfo(item);
    if (!other || other.stem !== info.stem || other.n !== info.n + 1) continue;
    const file = item.files.find((f) => f.ext === 'pdf') ?? item.files.find((f) => f.ext === 'txt');
    if (file) return { relative: file.relative, label: `${other.word} ${other.n}` };
  }
  return null;
}
