export function findOrCreateActor(db, name) {
  const trimmed = name.trim()
  if (!trimmed) return null
  db.prepare('INSERT OR IGNORE INTO actors (name) VALUES (?)').run(trimmed)
  return db.prepare('SELECT id FROM actors WHERE name = ? COLLATE NOCASE').get(trimmed).id
}

export function linkActorToMovie(db, movieId, actorId, billingOrder = null) {
  db.prepare(
    'INSERT OR IGNORE INTO movie_actors (movie_id, actor_id, billing_order) VALUES (?, ?, ?)'
  ).run(movieId, actorId, billingOrder)
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
       -- Billed cast first in TMDB's order; anything added by hand has no
       -- billing position and falls to the end, alphabetically.
       ORDER BY ma.billing_order IS NULL, ma.billing_order, a.name COLLATE NOCASE`
    )
    .all(movieId)
}

export function actorNamesForMovie(db, movieId) {
  return listActorsForMovie(db, movieId).map((a) => a.name)
}

export function addActorToMovieByName(db, movieId, name, billingOrder = null) {
  const actorId = findOrCreateActor(db, name)
  if (actorId) linkActorToMovie(db, movieId, actorId, billingOrder)
  return actorId
}

// Full replace, mirroring setGenresForMovie. Needed because a metadata refetch
// must be able to *replace* a cast, not just append to it - updateMovie
// previously ignored actorNames entirely, so a refetch kept the old cast
// forever and then re-synced the FTS index from those stale names.
export function setActorsForMovie(db, movieId, actorNames) {
  db.prepare('DELETE FROM movie_actors WHERE movie_id = ?').run(movieId)
  // Index is the billing position - the caller supplies names already in
  // billing order, and that ordering is the whole point of storing them.
  actorNames.forEach((name, index) => addActorToMovieByName(db, movieId, name, index))
}
