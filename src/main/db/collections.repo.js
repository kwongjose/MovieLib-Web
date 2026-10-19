// TMDB names every franchise "<X> Collection", so an imported library ends up
import { log } from '../log'
// full of names that read as "Thor Collection collection" against a UI that
// already calls these things collections. Strip the suffix at the write
// chokepoints instead of at render time, so the stored name is the real one.
// Guarded against stripping to nothing - a collection literally called
// "Collection" is a name, not a suffix.
const COLLECTION_SUFFIX = /\s+collections?$/i

export function normalizeCollectionName(name) {
  const trimmed = (name ?? '').trim()
  return trimmed.replace(COLLECTION_SUFFIX, '').trim() || trimmed
}

// movie_count travels with every listing: the Collections sidebar shows it, and
// the Maintenance cleanup is sized by it. Callers that only want id/name (the
// filter dropdown, the autocomplete) simply ignore the extra column.
export function listCollections(db) {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(mc.movie_id) AS movie_count
       FROM collections c
       LEFT JOIN movie_collections mc ON mc.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all()
}

export function createCollection(db, name) {
  const normalized = normalizeCollectionName(name)
  const info = db.prepare('INSERT INTO collections (name) VALUES (?)').run(normalized)
  return info.lastInsertRowid
}

// createCollection uses a bare INSERT and throws SQLITE_CONSTRAINT_UNIQUE on a
// duplicate name - correct for the "New Collection" button, wrong for the
// importer, which hits the same franchise once per film in it.
export function findOrCreateCollection(db, name) {
  const normalized = normalizeCollectionName(name)
  if (!normalized) return null
  db.prepare('INSERT OR IGNORE INTO collections (name) VALUES (?)').run(normalized)
  return db.prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE').get(normalized).id
}

// A rename that lands on an existing name is a merge, not an error: after
// suffix-stripping, "Thor Collection" and "Thor" are the same collection, and
// a bare UPDATE would throw SQLITE_CONSTRAINT_UNIQUE on the NOCASE index.
// UPDATE OR IGNORE drops the movie_collections rows that would violate the
// composite PK (that film is already linked to the target); deleting the source
// row then cascades those leftovers away.
export function renameCollection(db, id, name) {
  const target = normalizeCollectionName(name)
  if (!target) return null

  const clash = db
    .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id <> ?')
    .get(target, id)

  if (!clash) {
    db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(target, id)
    return { id, name: target, merged: false }
  }

  db.transaction(() => {
    db.prepare('UPDATE OR IGNORE movie_collections SET collection_id = ? WHERE collection_id = ?').run(
      clash.id,
      id
    )
    db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  })()

  return { id: clash.id, name: target, merged: true }
}

// Existing databases are full of TMDB's suffixed names. Rename them once at
// startup; stripping can collide with a collection the user made by hand, so
// reuse the merge path rather than failing. Deliberately not wrapped in an
// outer transaction - each row commits through renameCollection on its own, so
// an interrupted run leaves a partly converted but consistent database that the
// next launch simply resumes. Idempotent: a second run finds nothing to do.
export function migrateCollectionNameSuffix(db) {
  const rows = db.prepare('SELECT id, name FROM collections').all()
  let changed = 0
  for (const row of rows) {
    if (normalizeCollectionName(row.name) === row.name) continue
    renameCollection(db, row.id, row.name)
    changed += 1
  }
  if (changed) log.info('db', `stripped "Collection" suffix from ${changed} collection name(s)`)
  return changed
}

export function deleteCollection(db, id) {
  // ON DELETE CASCADE on movie_collections.collection_id cleans up associations automatically.
  db.prepare('DELETE FROM collections WHERE id = ?').run(id)
}

export function addMovieToCollection(db, collectionId, movieId) {
  db.prepare('INSERT OR IGNORE INTO movie_collections (collection_id, movie_id) VALUES (?, ?)').run(
    collectionId,
    movieId
  )
}

export function removeMovieFromCollection(db, collectionId, movieId) {
  db.prepare('DELETE FROM movie_collections WHERE collection_id = ? AND movie_id = ?').run(collectionId, movieId)
}

// INSERT OR IGNORE inside one transaction: adding 30 ticked films is a single
// DB round trip, and re-adding a film that is already in the collection is a
// no-op, so the caller never has to diff current membership first. The return
// value counts only the links that were actually new.
export function addMoviesToCollection(db, collectionId, movieIds) {
  const link = db.prepare('INSERT OR IGNORE INTO movie_collections (collection_id, movie_id) VALUES (?, ?)')
  return db.transaction((ids) => {
    let added = 0
    for (const movieId of ids) added += link.run(collectionId, movieId).changes
    return added
  })(movieIds)
}

export function removeMoviesFromCollection(db, collectionId, movieIds) {
  if (!movieIds.length) return 0
  const placeholders = movieIds.map(() => '?').join(',')
  return db
    .prepare(`DELETE FROM movie_collections WHERE collection_id = ? AND movie_id IN (${placeholders})`)
    .run(collectionId, ...movieIds).changes
}

// Powers the "remove from" half of the bulk dialog: only the collections at
// least one ticked film is in, plus how many of the ticked films that is - so a
// partial removal ("3 of 6 selected") is visible before it happens.
export function listCollectionsForMovies(db, movieIds) {
  if (!movieIds.length) return []
  const placeholders = movieIds.map(() => '?').join(',')
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(*) AS selected_count
       FROM collections c
       JOIN movie_collections mc ON mc.collection_id = c.id
       WHERE mc.movie_id IN (${placeholders})
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(movieIds)
}

// A TMDB import links every film's franchise, so a large library ends up with
// hundreds of one- and two-film collections. These two bulk deletes clear that
// out; both rely on ON DELETE CASCADE on movie_collections.collection_id, so
// the movies themselves are never touched.
const SMALL_COLLECTION_IDS = `
  SELECT c.id
  FROM collections c
  LEFT JOIN movie_collections mc ON mc.collection_id = c.id
  GROUP BY c.id
  HAVING COUNT(mc.movie_id) < ?
`

export function countSmallCollections(db, minMovies) {
  return db.prepare(`SELECT COUNT(*) AS c FROM (${SMALL_COLLECTION_IDS})`).get(minMovies).c
}

export function deleteSmallCollections(db, minMovies) {
  return db.prepare(`DELETE FROM collections WHERE id IN (${SMALL_COLLECTION_IDS})`).run(minMovies)
    .changes
}

export function deleteAllCollections(db) {
  return db.prepare('DELETE FROM collections').run().changes
}

export function listCollectionsForMovie(db, movieId) {
  return db
    .prepare(
      `SELECT c.id, c.name
       FROM collections c
       JOIN movie_collections mc ON mc.collection_id = c.id
       WHERE mc.movie_id = ?
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(movieId)
}
