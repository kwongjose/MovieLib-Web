import { getDb } from '../db'
import { listMoviesMissingRating, updateImdbRating } from '../db/movies.repo'
import { listKeyValues } from '../db/omdbKeys.repo'
import { createKeyPool } from './keyPool'
import { fetchByTitle, fetchByImdbId, OmdbRateLimitError, OmdbAuthError } from './omdbClient'

// A scan imports films whether or not OMDb could supply a rating, because TMDB
// is the metadata source and OMDb only contributes that one number. The catch is
// that a re-scan will never revisit them: findNewFiles partitions on path, and
// those films are already in the library. Without this, a scan run while the
// OMDb key was spent leaves ratings permanently blank.
//
// This matters at ordinary library sizes rather than as an edge case. The free
// OMDb tier allows 1000 lookups a day, so any library past a thousand films is
// guaranteed to finish its first scan with some ratings missing.

// Same as the scanner. Each film is one OMDb request, so this is a modest
// number of connections, not a thundering herd.
const CONCURRENCY = 5

// Only the rating is written, so unlike the scanner there is no batching to do -
// each update is a single narrow UPDATE against one row.
async function ratingFor(pool, movie, failures) {
  for (;;) {
    const key = pool.current()
    if (!key) return { status: 'no-keys' }

    try {
      const data = movie.imdb_id
        ? await fetchByImdbId(key, movie.imdb_id)
        : await fetchByTitle(key, movie.title, movie.year)

      // OMDb returns "N/A" for films it holds but has no score for; that parses
      // to null and is a real answer, not a failure to retry against other keys.
      return data.imdb_rating == null
        ? { status: 'unavailable' }
        : { status: 'ok', rating: data.imdb_rating }
    } catch (error) {
      const isRateLimit = error instanceof OmdbRateLimitError
      const isInvalid = error instanceof OmdbAuthError
      if (!isRateLimit && !isInvalid) return { status: 'not-found' }

      if (!failures.has(key)) failures.set(key, isRateLimit ? 'rate-limit' : 'invalid')
      if (!pool.markExhausted(key)) return { status: 'no-keys' }
      // another key is available - same film, next key
    }
  }
}

export async function backfillRatings(onProgress) {
  const db = getDb()

  const keys = listKeyValues(db)
  if (!keys.length) throw new Error('Add an OMDb API key in Settings first.')
  const pool = createKeyPool(keys)

  const pending = listMoviesMissingRating(db)
  const total = pending.length

  let processed = 0
  let filled = 0
  let unavailable = 0
  let stoppedEarly = false
  const keyFailures = new Map()

  // Sequential in batches rather than a queue of every film: the run stops as
  // soon as the keys are spent, and there is no point having 600 tasks queued
  // behind that decision.
  for (let i = 0; i < pending.length && !stoppedEarly; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)

    const results = await Promise.all(
      batch.map(async (movie) => ({ movie, result: await ratingFor(pool, movie, keyFailures) }))
    )

    for (const { movie, result } of results) {
      if (result.status === 'ok') {
        updateImdbRating(db, movie.id, result.rating)
        filled += 1
      } else if (result.status === 'unavailable') {
        unavailable += 1
      } else if (result.status === 'no-keys') {
        // Every remaining film would fail identically - stop cleanly and report
        // how many are left rather than grinding through them.
        stoppedEarly = true
        continue
      }
      processed += 1
      onProgress?.({ current: processed, total, currentTitle: movie.title })
    }
  }

  const reasons = [...keyFailures.values()]
  return {
    total,
    filled,
    unavailable,
    remaining: total - filled - unavailable,
    stoppedEarly,
    keysRateLimited: reasons.filter((r) => r === 'rate-limit').length,
    keysInvalid: reasons.filter((r) => r === 'invalid').length
  }
}
