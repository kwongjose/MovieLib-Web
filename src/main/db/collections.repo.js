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
  const trimmed = name.trim()
  const info = db.prepare('INSERT INTO collections (name) VALUES (?)').run(trimmed)
  return info.lastInsertRowid
}

// createCollection uses a bare INSERT and throws SQLITE_CONSTRAINT_UNIQUE on a
// duplicate name - correct for the "New Collection" button, wrong for the
// importer, which hits the same franchise once per film in it.
export function findOrCreateCollection(db, name) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return null
  db.prepare('INSERT OR IGNORE INTO collections (name) VALUES (?)').run(trimmed)
  return db.prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE').get(trimmed).id
}

export function renameCollection(db, id, name) {
  db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name.trim(), id)
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
