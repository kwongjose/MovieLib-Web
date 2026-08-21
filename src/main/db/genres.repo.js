export function listGenres(db) {
  return db.prepare('SELECT id, name FROM genres ORDER BY name COLLATE NOCASE').all()
}

export function findOrCreateGenre(db, name) {
  const trimmed = name.trim()
  if (!trimmed) return null
  db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)').run(trimmed)
  return db.prepare('SELECT id FROM genres WHERE name = ? COLLATE NOCASE').get(trimmed).id
}

export function addGenre(db, name) {
  return findOrCreateGenre(db, name)
}

export function removeGenre(db, name) {
  // ON DELETE CASCADE on movie_genres.genre_id cleans up associations automatically.
  db.prepare('DELETE FROM genres WHERE name = ? COLLATE NOCASE').run(name.trim())
}

export function listGenresForMovie(db, movieId) {
  return db
    .prepare(
      `SELECT g.id, g.name
       FROM genres g
       JOIN movie_genres mg ON mg.genre_id = g.id
       WHERE mg.movie_id = ?
       ORDER BY g.name COLLATE NOCASE`
    )
    .all(movieId)
}

// Replaces a movie's full genre set (used on import and on manual edit).
export function setGenresForMovie(db, movieId, genreNames) {
  db.prepare('DELETE FROM movie_genres WHERE movie_id = ?').run(movieId)
  const link = db.prepare('INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)')
  for (const name of genreNames) {
    const genreId = findOrCreateGenre(db, name)
    if (genreId) link.run(movieId, genreId)
  }
}
