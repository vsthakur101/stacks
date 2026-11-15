import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Annotation, AnnotationKind, HighlightColor, Rect } from '@/lib/shared/annotations';
import { getDb } from '../db/client';
import { annotations } from '../db/schema';

type Row = typeof annotations.$inferSelect;

function toAnnotation(r: Row): Annotation {
  return {
    id: r.id,
    file: r.file,
    identifier: r.identifier,
    page: r.page,
    kind: r.kind as AnnotationKind,
    rect: r.rectJson ? (JSON.parse(r.rectJson) as Rect) : null,
    color: (r.color as HighlightColor | null) ?? null,
    note: r.note,
    text: r.text,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface NewAnnotation {
  file: string;
  identifier: string | null;
  page: number;
  kind: AnnotationKind;
  rect?: Rect | null;
  color?: HighlightColor | null;
  note?: string | null;
  text?: string | null;
}

export function createAnnotation(a: NewAnnotation): Annotation {
  const now = Date.now();
  const row = getDb()
    .insert(annotations)
    .values({
      id: randomUUID(),
      file: a.file,
      identifier: a.identifier,
      page: a.page,
      kind: a.kind,
      rectJson: a.rect ? JSON.stringify(a.rect) : null,
      color: a.color ?? null,
      note: a.note?.trim() || null,
      text: a.text?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return toAnnotation(row);
}

export function updateAnnotation(id: string, patch: { note?: string | null; color?: HighlightColor }): Annotation | null {
  const row = getDb()
    .update(annotations)
    .set({
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      ...(patch.color ? { color: patch.color } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(annotations.id, id))
    .returning()
    .get();
  return row ? toAnnotation(row) : null;
}

export function deleteAnnotation(id: string): boolean {
  return getDb().delete(annotations).where(eq(annotations.id, id)).run().changes > 0;
}

export function annotationsFor(file: string): Annotation[] {
  return getDb().select().from(annotations).where(eq(annotations.file, file)).orderBy(asc(annotations.page), asc(annotations.createdAt)).all().map(toAnnotation);
}

export function allAnnotations(): Annotation[] {
  return getDb().select().from(annotations).orderBy(desc(annotations.updatedAt)).all().map(toAnnotation);
}

/** Toggles a bookmark on a page; returns whether the page is now bookmarked. */
/** Adds or removes the page's bookmark. Returns the new bookmark, or null when it was removed. */
export function toggleBookmark(file: string, identifier: string | null, page: number): Annotation | null {
  const db = getDb();
  const existing = db
    .select()
    .from(annotations)
    .where(and(eq(annotations.file, file), eq(annotations.page, page), eq(annotations.kind, 'bookmark')))
    .get();
  if (existing) {
    db.delete(annotations).where(eq(annotations.id, existing.id)).run();
    return null;
  }
  return createAnnotation({ file, identifier, page, kind: 'bookmark' });
}

/** Markdown for one or more books: grouped by book, then page. */
export function toMarkdown(books: { title: string; annotations: Annotation[] }[]): string {
  const out: string[] = ['# Highlights and notes', ''];
  for (const book of books) {
    if (book.annotations.length === 0) continue;
    out.push(`## ${book.title}`, '');
    for (const a of [...book.annotations].sort((x, y) => x.page - y.page || x.createdAt - y.createdAt)) {
      if (a.kind === 'bookmark') {
        // A bookmark's note is its name ("सर्ग ९").
        out.push(`- **Page ${a.page}**, Bookmark${a.note ? `: ${a.note.replace(/\s+/g, ' ')}` : ''}`);
        continue;
      }
      const label = a.kind === 'note' ? 'Note' : `Highlight (${a.color ?? 'yellow'})`;
      out.push(`- **Page ${a.page}**, ${label}`);
      // Blank lines keep the note out of the quote (Markdown would otherwise continue the quote lazily).
      if (a.text) out.push('', `  > ${a.text.replace(/\n+/g, ' ')}`);
      if (a.note) out.push('', `  ${a.note.trim().replace(/\n+/g, '\n\n  ')}`);
      if (a.text || a.note) out.push('');
    }
    out.push('');
  }
  return `${out.join('\n').trim()}\n`;
}
