import { guard } from '@/lib/server/api';
import { allAnnotations, annotationsFor, toMarkdown } from '@/lib/server/library/annotations';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { getSettings } from '@/lib/server/settings';
import type { Annotation } from '@/lib/shared/annotations';

export const dynamic = 'force-dynamic';

/** Markdown of one book's annotations (?file=…) or all of them. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const file = new URL(req.url).searchParams.get('file');
  const list = file ? annotationsFor(file) : allAnnotations();
  const byFile = new Map<string, Annotation[]>();
  for (const a of list) byFile.set(a.file, [...(byFile.get(a.file) ?? []), a]);
  const root = getSettings().downloadRoot;
  const books = await Promise.all(
    [...byFile.entries()].map(async ([f, annotations]) => ({ title: (await titleForFile(root, f)).title, annotations })),
  );
  books.sort((a, b) => a.title.localeCompare(b.title));
  const name = file && books[0] ? books[0].title : 'Stacks highlights';
  const safe = name.replace(/[^\p{L}\p{N} ()_.-]+/gu, ' ').trim().slice(0, 80) || 'Stacks highlights';
  return new Response(toMarkdown(books), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${safe} - notes.md`)}`,
    },
  });
}
