import { normalize } from 'node:path'
import {
  listActorsForMovie,
  actorNamesForMovie,
  addActorToMovieByName,
  unlinkActorFromMovie,
  setActorsForMovie
} from './actors.repo'
import { listGenresForMovie, setGenresForMovie } from './genres.repo'
import {
  listCollectionsForMovie,
  findOrCreateCollection,
  addMovieToCollection
} from './collections.repo'

const SORTABLE_COLUMNS = {
  title: 'm.title COLLATE NOCASE',
  year: 'm.year',
  rated: 'm.rated COLLATE NOCASE',
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
  const { search, genreIds, decades, ratingBuckets, ratedValues, collectionIds, watched, sortBy, sortDir } =
    filters

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

  // MPAA certificate, matched exactly against the values actually present in
  // the library (OMDb returns everything from "PG-13" to "Approved" to
  // "TV-MA" depending on the film's age and type, so the option list is
  // built from the data rather than hardcoded).
  if (ratedValues && ratedValues.length) {
    where.push(`m.rated IN (${ratedValues.map(() => '?').join(',')})`)
    params.push(...ratedValues)
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
  'tmdb_id',
  'tmdb_media_type',
  'trailer_key',
  'trailer_site',
  'trailer_checked_at',
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

// TMDB franchises ("Blade Runner Collection") map onto the app's existing
// Collections rather than a parallel concept, so an imported franchise behaves
// exactly like a hand-made collection and stays user-editable. Additive only -
// re-importing never removes a collection the user assigned themselves.
function linkCollectionByName(db, movieId, collectionName) {
  if (!collectionName) return
  const collectionId = findOrCreateCollection(db, collectionName)
  if (collectionId) addMovieToCollection(db, collectionId, movieId)
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
  if (payload.actorNames) setActorsForMovie(db, movieId, payload.actorNames)
  linkCollectionByName(db, movieId, payload.collectionName)

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
  if (payload.actorNames) setActorsForMovie(db, id, payload.actorNames)
  linkCollectionByName(db, id, payload.collectionName)

  syncFtsForMovie(db, id)
  return getMovieById(db, id)
}

// Replaces the fetched-metadata fields only. width/height/resolution_label and
// path are deliberately untouched: the locally probed resolution and the file's
// location must survive a refetch.
export function updateMetadataFields(db, id, fields) {
  return updateMovie(db, id, {
    title: fields.title,
    year: fields.year,
    rated: fields.rated,
    imdb_rating: fields.imdb_rating,
    imdb_id: fields.imdb_id,
    tmdb_id: fields.tmdb_id,
    tmdb_media_type: fields.tmdb_media_type,
    trailer_key: fields.trailer_key,
    trailer_site: fields.trailer_site,
    trailer_checked_at: fields.trailer_checked_at,
    runtime_minutes: fields.runtime_minutes,
    runtime_label: fields.runtime_label,
    plot: fields.plot,
    poster_url: fields.poster_url,
    genreNames: fields.genreNames,
    actorNames: fields.actorNames,
    collectionName: fields.collectionName
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

// Distinct MPAA certificates present in the library, for the filter list.
export function listRatedValues(db) {
  return db
    .prepare("SELECT DISTINCT rated FROM movies WHERE rated IS NOT NULL AND rated <> '' ORDER BY rated COLLATE NOCASE")
    .all()
    .map((r) => r.rated)
}

export function findDuplicateMovies(db) {
  // Grouped by tmdb_id first: it is an exact identity, so the same film under
  // two different filenames is caught even when the parsed titles disagree.
  // The title+year pass is kept for rows with no tmdb_id (hand-added films, or
  // anything imported before the TMDB switch), and the two are unioned so
  // neither kind of duplicate is missed.
  return db
    .prepare(
      `SELECT title, year, COUNT(*) AS count, GROUP_CONCAT(id) AS movie_ids
       FROM movies
       WHERE tmdb_id IS NOT NULL
       GROUP BY tmdb_id
       HAVING COUNT(*) > 1
       UNION ALL
       SELECT title, year, COUNT(*) AS count, GROUP_CONCAT(id) AS movie_ids
       FROM movies
       WHERE tmdb_id IS NULL
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
