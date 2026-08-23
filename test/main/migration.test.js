import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeDb, addMovie, insertRawCollection, link, namesIn } from '../helpers/db'
import {
  migrateCollectionNameSuffix,
  listCollections,
  createCollection
} from '../../src/main/db/collections.repo'

// This is the one piece of the change that destructively rewrites a user's
// existing library, so it gets the closest coverage.

let db

beforeEach(() => {
  db = makeDb()
})

afterEach(() => {
  db.close()
})

describe('migrateCollectionNameSuffix', () => {
  it('strips the suffix from names an import already stored', () => {
    insertRawCollection(db, 'Thor Collection')
    insertRawCollection(db, 'Captain America Collection')

    expect(migrateCollectionNameSuffix(db)).toBe(2)
    expect(listCollections(db).map((c) => c.name)).toEqual(['Captain America', 'Thor'])
  })

  it('keeps the row id when there is nothing to merge with', () => {
    const id = insertRawCollection(db, 'Thor Collection')
    migrateCollectionNameSuffix(db)

    expect(listCollections(db)).toEqual([{ id, name: 'Thor', movie_count: 0 }])
  })

  it('leaves names without the suffix untouched', () => {
    insertRawCollection(db, 'Marvel')
    insertRawCollection(db, 'The Collector')

    expect(migrateCollectionNameSuffix(db)).toBe(0)
    expect(listCollections(db).map((c) => c.name)).toEqual(['Marvel', 'The Collector'])
  })

  it('merges a stripped name onto a hand-made collection, keeping every film', () => {
    const thor1 = addMovie(db, 'Thor')
    const thor2 = addMovie(db, 'Thor Ragnarok')
    const thor3 = addMovie(db, 'Thor Love and Thunder')

    const imported = insertRawCollection(db, 'Thor Collection')
    const handMade = insertRawCollection(db, 'Thor')
    link(db, imported, thor1)
    link(db, imported, thor2)
    link(db, handMade, thor3)

    migrateCollectionNameSuffix(db)

    expect(listCollections(db)).toHaveLength(1)
    expect(namesIn(db, 'Thor')).toEqual(['Thor', 'Thor Love and Thunder', 'Thor Ragnarok'])
  })

  it('merges case-insensitively', () => {
    // collections.name is UNIQUE COLLATE NOCASE, so these are the same row.
    insertRawCollection(db, 'THOR COLLECTION')
    insertRawCollection(db, 'thor')

    migrateCollectionNameSuffix(db)

    expect(listCollections(db)).toHaveLength(1)
  })

  it('does not duplicate a film that was in both collections', () => {
    const shared = addMovie(db, 'Thor')
    const imported = insertRawCollection(db, 'Thor Collection')
    const handMade = insertRawCollection(db, 'Thor')
    link(db, imported, shared)
    link(db, handMade, shared)

    migrateCollectionNameSuffix(db)

    expect(db.prepare('SELECT COUNT(*) AS c FROM movie_collections').get().c).toBe(1)
  })

  it('leaves no links pointing at a collection that no longer exists', () => {
    const movie = addMovie(db, 'Thor')
    const imported = insertRawCollection(db, 'Thor Collection')
    insertRawCollection(db, 'Thor')
    link(db, imported, movie)

    migrateCollectionNameSuffix(db)

    const orphans = db
      .prepare(
        `SELECT COUNT(*) AS c FROM movie_collections mc
         LEFT JOIN collections c ON c.id = mc.collection_id
         WHERE c.id IS NULL`
      )
      .get().c
    expect(orphans).toBe(0)
  })

  it('never touches the movies themselves', () => {
    addMovie(db, 'Thor')
    addMovie(db, 'Thor Ragnarok')
    insertRawCollection(db, 'Thor Collection')

    migrateCollectionNameSuffix(db)

    expect(db.prepare('SELECT COUNT(*) AS c FROM movies').get().c).toBe(2)
  })

  it('is idempotent - a second run has nothing left to do', () => {
    const movie = addMovie(db, 'Thor')
    const imported = insertRawCollection(db, 'Thor Collection')
    insertRawCollection(db, 'Thor')
    link(db, imported, movie)

    migrateCollectionNameSuffix(db)
    const after = listCollections(db)

    expect(migrateCollectionNameSuffix(db)).toBe(0)
    expect(listCollections(db)).toEqual(after)
  })

  it('has already run by the time applySchema returns', () => {
    // makeDb() calls applySchema, so a collection created afterwards is proof
    // the table existed when the migration ran - i.e. the call is correctly
    // ordered after CREATE_STATEMENTS.
    expect(() => createCollection(db, 'Thor Collection')).not.toThrow()
    expect(listCollections(db).map((c) => c.name)).toEqual(['Thor'])
  })
})
