import { peekItem } from '../catalog/archive';
import { itemForFile, titleFromFileName } from './scan';

/** A display title for a file in the download folder: cached item title, else from the file name. */
export async function titleForFile(root: string, relative: string): Promise<{ title: string; identifier: string | null }> {
  const item = await itemForFile(root, relative);
  const title = (item && peekItem(item.identifier)?.title) ?? titleFromFileName(relative.split('/').pop() ?? relative);
  return { title, identifier: item?.identifier ?? null };
}
