import { describe, it, expect } from 'vitest'
import { GENRE_ALIASES, posterUrl, mapGenreNames, mapMovieDetails } from '../../src/main/importer/tmdbMapper'

// The module's own header comment invites this: it is deliberately free of any
// electron import so it can be exercised against recorded TMDB payloads.

describe('posterUrl', () => {
  it('builds an absolute URL from a poster path', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg')
  })

  it('is null-safe', () => {
    expect(posterUrl(null)).toBeNull()
    expect(posterUrl(undefined)).toBeNull()
  })
})

describe('mapGenreNames', () => {
  it("maps TMDB's vocabulary onto the genre list the app seeds", () => {
    expect(GENRE_ALIASES['Science Fiction']).toBe('Sci-Fi')
    expect(mapGenreNames([{ name: 'Science Fiction' }, { name: 'Action' }])).toEqual(['Sci-Fi', 'Action'])
  })
})

describe('mapMovieDetails - collectionName', () => {
  it('carries the franchise name through for the Collection link', () => {
    // Verbatim from TMDB, suffix and all - stripping happens at the DB
    // chokepoint (findOrCreateCollection), not here.
    const mapped = mapMovieDetails({ id: 1, title: 'Thor', belongs_to_collection: { name: 'Thor Collection' } })
    expect(mapped.collectionName).toBe('Thor Collection')
  })

  it('is null when the film is in no franchise', () => {
    expect(mapMovieDetails({ id: 1, title: 'Heat' }).collectionName).toBeNull()
    expect(mapMovieDetails({ id: 1, title: 'Heat', belongs_to_collection: null }).collectionName).toBeNull()
  })
})
