import { getMovieDetails } from './tmdbClient'
import { resolveTmdbId } from './tmdbLookup'
import { mapMovieDetails } from './tmdbMapper'

// Shared by the scanner and the single-movie IPC handlers. Both need the same
// notion of "what a complete movie record looks like", and duplicating the
// fallback rules in two places is how the two paths quietly diverge.

// Resolve to a TMDB id, then pull metadata, trailer, cast and certificate in a
// single appended request. Two calls, and only the second is ever large.
export async function fetchTmdbRecord(credential, parsed) {
  const { tmdbId, mediaType } = await resolveTmdbId(credential, parsed)
  const details = await getMovieDetails(credential, tmdbId)
  return { ...mapMovieDetails(details), tmdb_media_type: mediaType }
}

// TMDB is authoritative; OMDb only backfills what TMDB left empty, so a sparse
// TMDB entry still ends up as complete a record as the old pipeline produced.
// imdb_rating is the exception - it is always OMDb's, because TMDB has no
// equivalent field at all.
export function mergeOmdbFallbacks(movie, omdb) {
  if (!omdb) return movie

  const merged = { ...movie, imdb_rating: omdb.imdb_rating ?? null }
  if (!merged.imdb_id) merged.imdb_id = omdb.imdb_id ?? null
  if (!merged.rated) merged.rated = omdb.rated ?? null
  if (!merged.plot) merged.plot = omdb.plot ?? null
  if (!merged.poster_url) merged.poster_url = omdb.poster_url ?? null
  if (!merged.runtime_minutes) {
    merged.runtime_minutes = omdb.runtime_minutes ?? null
    merged.runtime_label = omdb.runtime_label ?? null
  }
  if (!merged.actorNames || !merged.actorNames.length) merged.actorNames = omdb.actorNames ?? []
  if (!merged.genreNames || !merged.genreNames.length) merged.genreNames = omdb.genreNames ?? []
  return merged
}

// A filename-shaped object for callers that already know the IMDb id and so
// never need the title-search ladder (the "Add by IMDb ID" form).
export function imdbIdLookup(imdbId) {
  return { title: imdbId, year: null, imdbId, candidates: [] }
}
