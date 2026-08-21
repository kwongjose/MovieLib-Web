import { normalize } from 'node:path'
import { listActorsForMovie, actorNamesForMovie, addActorToMovieByName, unlinkActorFromMovie } from './actors.repo'
import { listGenresForMovie, setGenresForMovie } from './genres.repo'
import { listCollectionsForMovie } from './collections.repo'

const SORTABLE_COLUMNS = {
  title: 'm.title COLLATE NOCASE',
  year: 'm.year',
  imdb_rating: 'm.imdb_rating',
  runtime_minutes: 'm.runtime_minutes',
  resolution: 'm.width * m.height',
  last_watched_at: 'm.last_watched_at'
}

const RATING_BUCKETS = {
  '9+': { clause: 'm.imdb_rating >= ?', params: [9] },
  '8-9': { clause: 'm.imdb_rating >= ? AND m.imdb_rating < ?', params: [8, 9] },
  '7-8': { clause: 'm.imdb_rating >= ? AND m.imdb_rating < ?', params: [7, 8] },
  '6-7': { clause: 'm.imdb_rating >= ? AND m.imdb_rating < ?', params: [6, 7] },
  'below-6': { clause: 'm.imdb_rating < ?', params: [6] }
}

function escapeFtsPhrase(search) {
  return `"${search.replace(/"/g, '""')}"`
}

// Keeps the movies_fts index in sync with a movie's current title/actor names.
// Called from repo-level code after any write that could affect either -
// see the plan's "Search performance" section for why this isn't a SQL trigger.
export function syncFtsForMovie(db, movieId) {
  db.prepare('DELETE FROM movies_fts WHERE rowid = ?').run(movieId)

  const movie = db.prepare('SELECT title FROM movies WHERE id = ?').get(movieId)
  if (!movie) return

  const actorNames = actorNamesForMovie(db, movieId).join(' ')
  db.prepare('INSERT INTO movies_fts (rowid, title, actor_names) VALUES (?, ?, ?)').run(
    movieId,
    movie.title,
    actorNames
  )
}

export function listMovies(db, filters = {}) {
  const { search, genreIds, decades, ratingBuckets, collectionIds, watched, sortBy, sortDir } = filters

  const where = []
  const params = []

  if (search && search.trim()) {
    where.push('m.id IN (SELECT rowid FROM movies_fts WHERE movies_fts MATCH ?)')
    params.push(escapeFtsPhrase(search.trim()))
  }

  if (genreIds && genreIds.length) {
    where.push(
      `m.id IN (SELECT movie_id FROM movie_genres WHERE genre_id IN (${genreIds.map(() => '?').join(',')}))`
    )
    params.push(...genreIds)
  }

  if (collectionIds && collectionIds.length) {
    where.push(
      `m.id IN (SELECT movie_id FROM movie_collections WHERE collection_id IN (${collectionIds.map(() => '?').join(',')}))`
    )
    params.push(...collectionIds)
  }

  if (decades && decades.length) {
    const decadeClauses = decades.map((decade) => {
      params.push(`${String(decade).slice(0, 3)}%`)
      return 'm.year LIKE ?'
    })
    where.push(`(${decadeClauses.join(' OR ')})`)
  }

  if (ratingBuckets && ratingBuckets.length) {
    const bucketClauses = ratingBuckets
      .map((key) => RATING_BUCKETS[key])
      .filter(Boolean)
      .map((bucket) => {
        params.push(...bucket.params)
        return `(${bucket.clause})`
      })
    if (bucketClauses.length) where.push(`(${bucketClauses.join(' OR ')})`)
  }

  if (watched === true) where.push('m.last_watched_at IS NOT NULL')
  if (watched === false) where.push('m.last_watched_at IS NULL')

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const sortColumn = SORTABLE_COLUMNS[sortBy] ?? SORTABLE_COLUMNS.title
  const sortDirection = sortDir === 'desc' ? 'DESC' : 'ASC'

  const sql = `
    SELECT
      m.*,
      GROUP_CONCAT(DISTINCT g.name) AS genre_names,
      GROUP_CONCAT(DISTINCT a.name) AS actor_names
    FROM movies m
    LEFT JOIN movie_genres mg ON mg.movie_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    LEFT JOIN movie_actors ma ON ma.movie_id = m.id
    LEFT JOIN actors a ON a.id = ma.actor_id
    ${whereClause}
    GROUP BY m.id
    ORDER BY ${sortColumn} ${sortDirection}
  `

  return db.prepare(sql).all(...params)
}

export function getMovieById(db, id) {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id)
  if (!movie) return null

  return {
    ...movie,
    actors: listActorsForMovie(db, id),
    genres: listGenresForMovie(db, id),
    collections: listCollectionsForMovie(db, id)
  }
}

const MOVIE_COLUMNS = [
  'title',
  'year',
  'rated',
  'imdb_rating',
  'imdb_id',
  'runtime_minutes',
  'runtime_label',
  'width',
  'height',
  'resolution_label',
  'plot',
  'path',
  'poster_url'
]

// Paths can arrive with forward or back slashes depending on entry point
// (manual add vs. scanner discovery via path.join, which is always
// OS-native) - normalize so the UNIQUE constraint and dedup-by-path checks
// (existingPaths) can't be fooled by two spellings of the same file.
function normalizePayloadPath(payload) {
  if (payload.path === undefined) return payload
  return { ...payload, path: normalize(payload.path) }
}

export function createMovie(db, rawPayload) {
  const payload = normalizePayloadPath(rawPayload)
  const columns = MOVIE_COLUMNS.filter((col) => payload[col] !== undefined)
  const placeholders = columns.map(() => '?').join(', ')
  const values = columns.map((col) => payload[col] ?? null)

  const info = db
    .prepare(`INSERT INTO movies (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...values)
  const movieId = info.lastInsertRowid

  if (payload.genreNames) setGenresForMovie(db, movieId, payload.genreNames)
  if (payload.actorNames) {
    for (const name of payload.actorNames) addActorToMovieByName(db, movieId, name)
  }

  syncFtsForMovie(db, movieId)
  return getMovieById(db, movieId)
}

export function updateMovie(db, id, rawPayload) {
  const payload = normalizePayloadPath(rawPayload)
  const columns = MOVIE_COLUMNS.filter((col) => payload[col] !== undefined)
  if (columns.length) {
    const setClause = columns.map((col) => `${col} = ?`).join(', ')
    const values = columns.map((col) => payload[col] ?? null)
    db.prepare(`UPDATE movies SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
  }

  if (payload.genreNames) setGenresForMovie(db, id, payload.genreNames)

  syncFtsForMovie(db, id)
  return getMovieById(db, id)
}

// Replaces only the OMDb-sourced fields (used by "refetch from OMDb by IMDb ID").
// width/height/resolution_label/path are deliberately untouched - the locally
// probed resolution and file location survive a refetch.
export function updateOmdbFields(db, id, omdbFields) {
  return updateMovie(db, id, {
    title: omdbFields.title,
    year: omdbFields.year,
    rated: omdbFields.rated,
    imdb_rating: omdbFields.imdb_rating,
    imdb_id: omdbFields.imdb_id,
    runtime_minutes: omdbFields.runtime_minutes,
    runtime_label: omdbFields.runtime_label,
    plot: omdbFields.plot,
    poster_url: omdbFields.poster_url,
    genreNames: omdbFields.genreNames,
    actorNames: omdbFields.actorNames
  })
}

export function addActorToMovie(db, movieId, name) {
  const actorId = addActorToMovieByName(db, movieId, name)
  syncFtsForMovie(db, movieId)
  return actorId
}

export function removeActorFromMovie(db, movieId, actorId) {
  unlinkActorFromMovie(db, movieId, actorId)
  syncFtsForMovie(db, movieId)
}

export function markMovieWatched(db, id, dateIso) {
  db.prepare("UPDATE movies SET last_watched_at = ?, updated_at = datetime('now') WHERE id = ?").run(
    dateIso ?? new Date().toISOString(),
    id
  )
  return getMovieById(db, id)
}

export function clearMovieWatched(db, id) {
  db.prepare("UPDATE movies SET last_watched_at = NULL, updated_at = datetime('now') WHERE id = ?").run(id)
  return getMovieById(db, id)
}

export function getMoviePath(db, id) {
  return db.prepare('SELECT path FROM movies WHERE id = ?').get(id)?.path ?? null
}

export function deleteMovie(db, id) {
  db.prepare('DELETE FROM movies_fts WHERE rowid = ?').run(id)
  db.prepare('DELETE FROM movies WHERE id = ?').run(id)
}

export function listAllMoviePaths(db) {
  return db.prepare('SELECT id, path FROM movies').all()
}

export function deleteManyMovies(db, ids) {
  const deleteAll = db.transaction((movieIds) => {
    for (const id of movieIds) deleteMovie(db, id)
  })
  deleteAll(ids)
}

export function findDuplicateMovies(db) {
  return db
    .prepare(
      `SELECT title, year, COUNT(*) AS count, GROUP_CONCAT(id) AS movie_ids
       FROM movies
       GROUP BY title, year
       HAVING COUNT(*) > 1
       ORDER BY title COLLATE NOCASE`
    )
    .all()
}

export function existingPaths(db) {
  return new Set(db.prepare('SELECT path FROM movies').all().map((r) => r.path))
}

// Wipes all movies + actors (and their associations, via cascade / explicit
// FTS clear). Genres, collections, watch_folders, and settings are left
// alone - matches the original app's "Start Over", which also preserved
// the genre list.
export function resetLibrary(db) {
  const reset = db.transaction(() => {
    db.exec('DELETE FROM movies_fts')
    db.exec('DELETE FROM movies')
    db.exec('DELETE FROM actors')
  })
  reset()
}
