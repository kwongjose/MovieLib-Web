export function findOrCreateActor(db, name) {
  const trimmed = name.trim()
  if (!trimmed) return null
  db.prepare('INSERT OR IGNORE INTO actors (name) VALUES (?)').run(trimmed)
  return db.prepare('SELECT id FROM actors WHERE name = ? COLLATE NOCASE').get(trimmed).id
}

export function linkActorToMovie(db, movieId, actorId) {
  db.prepare('INSERT OR IGNORE INTO movie_actors (movie_id, actor_id) VALUES (?, ?)').run(movieId, actorId)
}

export function unlinkActorFromMovie(db, movieId, actorId) {
  db.prepare('DELETE FROM movie_actors WHERE movie_id = ? AND actor_id = ?').run(movieId, actorId)
}

export function listActorsForMovie(db, movieId) {
  return db
    .prepare(
      `SELECT a.id, a.name
       FROM actors a
       JOIN movie_actors ma ON ma.actor_id = a.id
       WHERE ma.movie_id = ?
       ORDER BY a.name COLLATE NOCASE`
    )
    .all(movieId)
}

export function actorNamesForMovie(db, movieId) {
  return listActorsForMovie(db, movieId).map((a) => a.name)
}

export function addActorToMovieByName(db, movieId, name) {
  const actorId = findOrCreateActor(db, name)
  if (actorId) linkActorToMovie(db, movieId, actorId)
  return actorId
}
