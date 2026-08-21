export function listCollections(db) {
  return db.prepare('SELECT id, name FROM collections ORDER BY name COLLATE NOCASE').all()
}

export function createCollection(db, name) {
  const trimmed = name.trim()
  const info = db.prepare('INSERT INTO collections (name) VALUES (?)').run(trimmed)
  return info.lastInsertRowid
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
