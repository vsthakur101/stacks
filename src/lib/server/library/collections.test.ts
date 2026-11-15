import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { createCollection, deleteCollection, fileRef, itemRef, listCollections, membersOf, membershipFor, renameCollection, setMembership } from './collections';

beforeEach(() => setDbForTests(openDb(':memory:')));
afterEach(() => setDbForTests(undefined));

describe('collections', () => {
  it('creates, fills, counts, renames and deletes', () => {
    const puranas = createCollection('  Puranas ');
    const toRead = createCollection('To read');
    expect(() => createCollection('puranas')).toThrow(/already/);
    setMembership(puranas.id, itemRef('shivapurana'), true);
    setMembership(puranas.id, itemRef('shivapurana'), true); // twice is fine
    setMembership(puranas.id, fileRef('Books/my scan.pdf'), true);
    setMembership(toRead.id, itemRef('shivapurana'), true);
    expect(listCollections().map((c) => [c.name, c.count])).toEqual([
      ['Puranas', 2],
      ['To read', 1],
    ]);
    expect(membershipFor([itemRef('shivapurana')]).get(itemRef('shivapurana'))?.sort()).toEqual([puranas.id, toRead.id].sort());
    setMembership(toRead.id, itemRef('shivapurana'), false);
    expect(membersOf(toRead.id).size).toBe(0);
    expect(renameCollection(toRead.id, 'Reading next')).toBe(true);
    expect(() => renameCollection(toRead.id, 'PURANAS')).toThrow(/already/);
    expect(deleteCollection(puranas.id)).toBe(true);
    expect(listCollections().map((c) => c.name)).toEqual(['Reading next']);
  });
});
