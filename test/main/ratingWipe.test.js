import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeDb } from '../helpers/db'
import { createMovie, updateMetadataFields, getMovieById } from '../../src/main/db/movies.repo'

// Characterising what happens to an existing IMDb rating when a refetch
// produces no rating. buildMovie.js cannot be imported here (it pulls in
// electron via tmdbClient), so the two shapes mergeOmdbFallbacks can produce
// are reproduced directly:
//   - OMDb unreachable / no key / not found -> `if (!omdb) return movie`, and
//     the TMDB record has no imdb_rating key at all, so the field is undefined
//   - OMDb answered but holds no score ("N/A") -> `imdb_rating: null`
describe('an existing imdb_rating during a metadata refetch', () => {
  let db
  let id

  beforeEach(() => {
    db = makeDb()
    id = createMovie(db, { title: 'The Great Escape', path: 'G:/movie/The Great Escape (1963).mkv', imdb_rating: 8.2 }).id
  })

  afterEach(() => db.close())

  it('survives when OMDb could not be consulted at all (undefined)', () => {
    updateMetadataFields(db, id, { title: 'The Great Escape', year: '1963' })
    expect(getMovieById(db, id).imdb_rating).toBe(8.2)
  })

  it('is cleared when OMDb answered with no score (null)', () => {
    updateMetadataFields(db, id, { title: 'The Great Escape', year: '1963', imdb_rating: null })
    expect(getMovieById(db, id).imdb_rating).toBeNull()
  })
})
