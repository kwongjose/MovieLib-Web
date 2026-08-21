const OMDB_BASE_URL = 'https://www.omdbapi.com/'

export class OmdbNotFoundError extends Error {}
export class OmdbRateLimitError extends Error {}
export class OmdbAuthError extends Error {}

function parseRating(value) {
  const num = parseFloat(value)
  return Number.isFinite(num) ? num : null
}

function parseRuntimeMinutes(value) {
  const match = /^(\d+)/.exec(value || '')
  return match ? parseInt(match[1], 10) : null
}

function naOrNull(value) {
  return value && value !== 'N/A' ? value : null
}

function splitList(value) {
  const clean = naOrNull(value)
  return clean ? clean.split(',').map((s) => s.trim()).filter(Boolean) : []
}

function mapOmdbResponse(data) {
  return {
    title: data.Title,
    year: data.Year,
    rated: naOrNull(data.Rated),
    imdb_rating: parseRating(data.imdbRating),
    imdb_id: data.imdbID,
    runtime_minutes: parseRuntimeMinutes(data.Runtime),
    runtime_label: naOrNull(data.Runtime),
    plot: naOrNull(data.Plot),
    poster_url: naOrNull(data.Poster),
    genreNames: splitList(data.Genre),
    actorNames: splitList(data.Actors)
  }
}

async function callOmdb(apiKey, params) {
  const query = new URLSearchParams({ ...params, plot: 'full', r: 'json', apikey: apiKey })
  const response = await fetch(`${OMDB_BASE_URL}?${query.toString()}`)

  // OMDb returns HTTP 401 (not 200) for an invalid key, still with a JSON
  // body - so the body must be inspected before falling back to a generic
  // HTTP-status error, or "invalid key" would look identical to a network
  // failure and never get its own (scan-halting) handling below.
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`OMDb request failed: HTTP ${response.status}`)
  }

  if (data.Response === 'False') {
    if (/invalid api key/i.test(data.Error || '')) {
      throw new OmdbAuthError(data.Error)
    }
    if (/request limit/i.test(data.Error || '')) {
      throw new OmdbRateLimitError(data.Error)
    }
    throw new OmdbNotFoundError(data.Error || 'Not found')
  }

  if (!response.ok) {
    throw new Error(`OMDb request failed: HTTP ${response.status}`)
  }

  return mapOmdbResponse(data)
}

export function fetchByTitle(apiKey, title, year) {
  const params = { t: title }
  if (year) params.y = year
  return callOmdb(apiKey, params)
}

export function fetchByImdbId(apiKey, imdbId) {
  return callOmdb(apiKey, { i: imdbId })
}
