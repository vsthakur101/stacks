import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { collectionMembers, collections } from '../db/schema';

/** Collections: the owner's own groups of Library items and files. A thing can be in several. */

export interface Collection {
  id: string;
  name: string;
  count: number;
}

export const itemRef = (identifier: string) => `item:${identifier}`;
export const fileRef = (relative: string) => `file:${relative}`;

export function listCollections(): Collection[] {
  const db = getDb();
  const counts = new Map(
    db
      .select({ id: collectionMembers.collectionId, n: count() })
      .from(collectionMembers)
      .groupBy(collectionMembers.collectionId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return db
    .select()
    .from(collections)
    .orderBy(asc(collections.name))
    .all()
    .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }));
}

export class DuplicateNameError extends Error {}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!n) throw new Error('A collection needs a name.');
  return n;
}

function nameTaken(name: string, except?: string): boolean {
  return listCollections().some((c) => c.id !== except && c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
}

export function createCollection(name: string): Collection {
  const n = cleanName(name);
  if (nameTaken(n)) throw new DuplicateNameError(`There’s already a collection called “${n}”.`);
  const row = { id: randomUUID(), name: n, createdAt: Date.now() };
  getDb().insert(collections).values(row).run();
  return { id: row.id, name: n, count: 0 };
}

export function renameCollection(id: string, name: string): boolean {
  const n = cleanName(name);
  if (nameTaken(n, id)) throw new DuplicateNameError(`There’s already a collection called “${n}”.`);
  return getDb().update(collections).set({ name: n }).where(eq(collections.id, id)).run().changes > 0;
}

export function deleteCollection(id: string): boolean {
  const db = getDb();
  db.delete(collectionMembers).where(eq(collectionMembers.collectionId, id)).run();
  return db.delete(collections).where(eq(collections.id, id)).run().changes > 0;
}

export function setMembership(id: string, ref: string, member: boolean): void {
  const db = getDb();
  if (!db.select({ id: collections.id }).from(collections).where(eq(collections.id, id)).get()) throw new Error('No such collection.');
  if (member) db.insert(collectionMembers).values({ collectionId: id, ref, addedAt: Date.now() }).onConflictDoNothing().run();
  else db.delete(collectionMembers).where(and(eq(collectionMembers.collectionId, id), eq(collectionMembers.ref, ref))).run();
}

export function membersOf(id: string): Set<string> {
  return new Set(getDb().select({ ref: collectionMembers.ref }).from(collectionMembers).where(eq(collectionMembers.collectionId, id)).all().map((r) => r.ref));
}

/** Which collections each ref is in. */
export function membershipFor(refs: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!refs.length) return out;
  const rows = getDb().select().from(collectionMembers).where(inArray(collectionMembers.ref, refs)).all();
  for (const r of rows) out.set(r.ref, [...(out.get(r.ref) ?? []), r.collectionId]);
  return out;
}
