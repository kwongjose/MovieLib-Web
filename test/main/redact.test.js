import { describe, it, expect } from 'vitest'
import { redactUrl, scrubLine, REDACTED } from '../../src/main/log/redact'

// A plausible TMDB v3 key (32 hex) and a JWT-shaped v4 read token. Neither is
// real; both are the exact shapes the clients send.
const V3_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const V4_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhMWIyYzNkNGU1ZjYwNzE4MjkzYTRiNWM2ZDdlOGY5MCJ9.Q7Hc9_signature-part'
const OMDB_KEY = '5c941919'

describe('redactUrl', () => {
  // Built the way tmdbClient.js builds them. The clients cannot be imported
  // here - they pull in electron's net module - so the shapes are rebuilt.
  it('redacts a TMDB v3 key from a search URL', () => {
    const query = new URLSearchParams({ query: 'the matrix', primary_release_year: '1999', api_key: V3_KEY })
    const url = `https://api.themoviedb.org/3/search/movie?${query}`

    const out = redactUrl(url)
    expect(out).not.toContain(V3_KEY)
    expect(out).toContain(`api_key=${REDACTED}`)
    // Everything useful survives.
    expect(out).toContain('the+matrix')
    expect(out).toContain('primary_release_year=1999')
  })

  // Built the way omdbClient.js builds them.
  it('redacts an OMDb key and keeps the rest of the query', () => {
    const query = new URLSearchParams({ t: 'Heat', y: '1995', plot: 'full', r: 'json', apikey: OMDB_KEY })
    const url = `https://www.omdbapi.com/?${query}`

    const out = redactUrl(url)
    expect(out).not.toContain(OMDB_KEY)
    expect(out).toContain(`apikey=${REDACTED}`)
    expect(out).toContain('t=Heat')
  })

  it('redacts a key appearing as the first query parameter', () => {
    const out = redactUrl(`https://api.themoviedb.org/3/movie/550?api_key=${V3_KEY}&language=en-US`)
    expect(out).not.toContain(V3_KEY)
    expect(out).toContain('language=en-US')
  })

  it('leaves identifiers that merely look key-ish alone', () => {
    const url = 'https://api.themoviedb.org/3/movie/550?imdb_id=tt0133093&tmdb_id=603'
    expect(redactUrl(url)).toBe(url)
  })

  it('tolerates non-strings', () => {
    expect(redactUrl(null)).toBe('')
    expect(redactUrl(undefined)).toBe('')
    expect(redactUrl(42)).toBe('')
  })
})

describe('scrubLine', () => {
  it('redacts a key even when a call site forgot to', () => {
    const line = `2026-10-19 14:00:00.000 WARN  tmdb  /search/movie failed {"url":"https://api.themoviedb.org/3/search/movie?api_key=${V3_KEY}"}`
    expect(scrubLine(line)).not.toContain(V3_KEY)
  })

  // The v4 token travels in an Authorization header, never in the URL, so the
  // query-parameter rule cannot catch it. These two patterns are why.
  it('redacts a bearer token', () => {
    const out = scrubLine(`Authorization: Bearer ${V4_TOKEN}`)
    expect(out).not.toContain(V4_TOKEN)
    expect(out).toContain(`Bearer ${REDACTED}`)
  })

  it('redacts a bare JWT anywhere in the line', () => {
    const out = scrubLine(`credential rejected: ${V4_TOKEN} is not valid`)
    expect(out).not.toContain(V4_TOKEN)
    expect(out).toContain('is not valid')
  })

  it('leaves an ordinary line untouched', () => {
    const line = '2026-10-19 14:00:00.000 ERROR ipc   scan:start failed after 11 ms'
    expect(scrubLine(line)).toBe(line)
  })

  it('tolerates non-strings', () => {
    expect(scrubLine(null)).toBe('')
    expect(scrubLine(undefined)).toBe('')
  })
})
