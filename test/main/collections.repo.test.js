import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeDb, addMovie, insertRawCollection, link, namesIn } from '../helpers/db'
import {
  normalizeCollectionName,
  listCollections,
  createCollection,
  findOrCreateCollection,
  renameCollection,
  addMoviesToCollection,
  removeMoviesFromCollection,
  listCollectionsForMovies,
  listCollectionsForMovie
} from '../../src/main/db/collections.repo'

let db

beforeEach(() => {
  db = makeDb()
})

afterEach(() => {
  db.close()
})

describe('normalizeCollectionName', () => {
  it('strips a trailing "Collection", singular or plural, in any case', () => {
    expect(normalizeCollectionName('Thor Collection')).toBe('Thor')
    expect(normalizeCollectionName('Captain America Collections')).toBe('Captain America')
    expect(normalizeCollectionName('thor collection')).toBe('thor')
    expect(normalizeCollectionName('Alien COLLECTION')).toBe('Alien')
  })

  it('trims surrounding and internal edge whitespace', () => {
    expect(normalizeCollectionName('  Alien  Collection  ')).toBe('Alien')
    expect(normalizeCollectionName('  Marvel  ')).toBe('Marvel')
  })

  it('leaves names without the suffix alone', () => {
    expect(normalizeCollectionName('Marvel')).toBe('Marvel')
    expect(normalizeCollectionName('The Collector')).toBe('The Collector')
  })

  it('does not strip a name that is only the suffix', () => {
    // Guard against normalizing to empty - "Collection" on its own is a name.
    expect(normalizeCollectionName('Collection')).toBe('Collection')
    expect(normalizeCollectionName('Collections')).toBe('Collections')
  })

  it('handles null and undefined', () => {
    expect(normalizeCollectionName(null)).toBe('')
    expect(normalizeCollectionName(undefined)).toBe('')
  })
})

describe('createCollection / findOrCreateCollection', () => {
  it('stores the normalized name', () => {
    createCollection(db, 'Thor Collection')
    expect(listCollections(db).map((c) => c.name)).toEqual(['Thor'])
  })

  it('throws on a duplicate, including one only equal after normalizing', () => {
    createCollection(db, 'Thor')
    // The case the Collections tab now has to catch: same name after stripping.
    expect(() => createCollection(db, 'Thor Collection')).toThrow(/UNIQUE/i)
  })

  it('returns one id for every spelling of the same collection', () => {
    const a = findOrCreateCollection(db, 'Thor Collection')
    const b = findOrCreateCollection(db, 'Thor')
    const c = findOrCreateCollection(db, 'thor')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(listCollections(db)).toHaveLength(1)
  })

  it('returns null for a blank name', () => {
    expect(findOrCreateCollection(db, '   ')).toBeNull()
    expect(findOrCreateCollection(db, null)).toBeNull()
  })
})

describe('renameCollection', () => {
  it('renames in place when nothing collides', () => {
    const id = createCollection(db, 'Thor')
    const result = renameCollection(db, id, 'Asgard')
    expect(result).toEqual({ id, name: 'Asgard', merged: false })
    expect(listCollections(db).map((c) => c.name)).toEqual(['Asgard'])
  })

  it('normalizes the new name', () => {
    const id = createCollection(db, 'Thor')
    expect(renameCollection(db, id, 'Asgard Collection').name).toBe('Asgard')
  })

  it('merges into the existing collection instead of throwing', () => {
    const thor1 = addMovie(db, 'Thor')
    const thor2 = addMovie(db, 'Thor Ragnarok')

    const source = insertRawCollection(db, 'Thor Collection')
    const target = insertRawCollection(db, 'Thor')
    link(db, source, thor1)
    link(db, source, thor2)

    const result = renameCollection(db, source, 'Thor')

    expect(result).toEqual({ id: target, name: 'Thor', merged: true })
    expect(listCollections(db)).toHaveLength(1)
    expect(namesIn(db, 'Thor')).toEqual(['Thor', 'Thor Ragnarok'])
  })

  it('keeps one link when a film is in both the source and the target', () => {
    // The UPDATE OR IGNORE path: the moved row would violate the composite PK.
    const shared = addMovie(db, 'Thor')
    const only = addMovie(db, 'Thor Ragnarok')

    const source = insertRawCollection(db, 'Thor Collection')
    const target = insertRawCollection(db, 'Thor')
    link(db, source, shared)
    link(db, source, only)
    link(db, target, shared)

    renameCollection(db, source, 'Thor')

    expect(namesIn(db, 'Thor')).toEqual(['Thor', 'Thor Ragnarok'])
    expect(db.prepare('SELECT COUNT(*) AS c FROM movie_collections').get().c).toBe(2)
    expect(listCollectionsForMovie(db, shared)).toHaveLength(1)
  })

  it('leaves no links pointing at the deleted source row', () => {
    const movie = addMovie(db, 'Thor')
    const source = insertRawCollection(db, 'Thor Collection')
    insertRawCollection(db, 'Thor')
    link(db, source, movie)

    renameCollection(db, source, 'Thor')

    const orphans = db
      .prepare(
        `SELECT COUNT(*) AS c FROM movie_collections mc
         LEFT JOIN collections c ON c.id = mc.collection_id
         WHERE c.id IS NULL`
      )
      .get().c
    expect(orphans).toBe(0)
  })

  it('returns null for a blank name rather than clearing the row', () => {
    const id = createCollection(db, 'Thor')
    expect(renameCollection(db, id, '   ')).toBeNull()
    expect(listCollections(db).map((c) => c.name)).toEqual(['Thor'])
  })
})

describe('addMoviesToCollection', () => {
  it('links every movie and reports how many were new', () => {
    const ids = [addMovie(db, 'Thor'), addMovie(db, 'Thor Ragnarok'), addMovie(db, 'Thor Love and Thunder')]
    const collection = createCollection(db, 'Thor')

    expect(addMoviesToCollection(db, collection, ids)).toBe(3)
    expect(namesIn(db, 'Thor')).toHaveLength(3)
  })

  it('is idempotent - re-adding the same selection adds nothing', () => {
    const ids = [addMovie(db, 'Thor'), addMovie(db, 'Thor Ragnarok')]
    const collection = createCollection(db, 'Thor')
    addMoviesToCollection(db, collection, ids)

    expect(addMoviesToCollection(db, collection, ids)).toBe(0)
    expect(namesIn(db, 'Thor')).toHaveLength(2)
  })

  it('counts only the new ones in a partially overlapping selection', () => {
    const a = addMovie(db, 'Thor')
    const b = addMovie(db, 'Thor Ragnarok')
    const collection = createCollection(db, 'Thor')
    addMoviesToCollection(db, collection, [a])

    expect(addMoviesToCollection(db, collection, [a, b])).toBe(1)
  })

  it('accepts an empty selection', () => {
    const collection = createCollection(db, 'Thor')
    expect(addMoviesToCollection(db, collection, [])).toBe(0)
  })

  it('lets one film sit in several collections at once', () => {
    // The whole point of the feature: Thor films in Thor *and* Marvel.
    const thor = [addMovie(db, 'Thor'), addMovie(db, 'Thor Ragnarok')]
    const cap = [addMovie(db, 'Captain America')]
    addMoviesToCollection(db, createCollection(db, 'Thor'), thor)
    addMoviesToCollection(db, createCollection(db, 'Captain America'), cap)
    addMoviesToCollection(db, createCollection(db, 'Marvel'), [...thor, ...cap])

    expect(namesIn(db, 'Marvel')).toHaveLength(3)
    expect(listCollectionsForMovie(db, thor[0]).map((c) => c.name)).toEqual(['Marvel', 'Thor'])
  })
})

describe('removeMoviesFromCollection', () => {
  it('removes only the given movies and reports the count', () => {
    const a = addMovie(db, 'Thor')
    const b = addMovie(db, 'Thor Ragnarok')
    const collection = createCollection(db, 'Thor')
    addMoviesToCollection(db, collection, [a, b])

    expect(removeMoviesFromCollection(db, collection, [a])).toBe(1)
    expect(namesIn(db, 'Thor')).toEqual(['Thor Ragnarok'])
  })

  it('ignores movies that were never in the collection', () => {
    const inIt = addMovie(db, 'Thor')
    const outOfIt = addMovie(db, 'Superman')
    const collection = createCollection(db, 'Thor')
    addMoviesToCollection(db, collection, [inIt])

    expect(removeMoviesFromCollection(db, collection, [inIt, outOfIt])).toBe(1)
  })

  it('never deletes the movies themselves', () => {
    const a = addMovie(db, 'Thor')
    const collection = createCollection(db, 'Thor')
    addMoviesToCollection(db, collection, [a])
    removeMoviesFromCollection(db, collection, [a])

    expect(db.prepare('SELECT COUNT(*) AS c FROM movies').get().c).toBe(1)
  })

  it('accepts an empty selection without building a malformed IN ()', () => {
    const collection = createCollection(db, 'Thor')
    expect(removeMoviesFromCollection(db, collection, [])).toBe(0)
  })
})

describe('listCollectionsForMovies', () => {
  it('reports how much of the selection each collection holds', () => {
    const thor = [addMovie(db, 'Thor'), addMovie(db, 'Thor Ragnarok')]
    const cap = [addMovie(db, 'Captain America')]
    const selection = [...thor, ...cap]

    addMoviesToCollection(db, createCollection(db, 'Thor'), thor)
    addMoviesToCollection(db, createCollection(db, 'Marvel'), selection)

    expect(listCollectionsForMovies(db, selection)).toEqual([
      { id: expect.any(Number), name: 'Marvel', selected_count: 3 },
      { id: expect.any(Number), name: 'Thor', selected_count: 2 }
    ])
  })

  it('omits collections the selection does not touch', () => {
    const movie = addMovie(db, 'Thor')
    addMoviesToCollection(db, createCollection(db, 'Thor'), [movie])
    createCollection(db, 'DC')

    expect(listCollectionsForMovies(db, [movie]).map((c) => c.name)).toEqual(['Thor'])
  })

  it('returns an empty array for an empty selection', () => {
    expect(listCollectionsForMovies(db, [])).toEqual([])
  })
})
