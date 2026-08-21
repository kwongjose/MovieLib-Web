import { net } from 'electron'

const OMDB_BASE_URL = 'https://www.omdbapi.com/'

// Uses Electron's net.request rather than global fetch: fetch only became
// available by default in Node 18, and Electron 22 (pinned for Windows 7
// support) bundles Node 16.17, where it's undefined - and net.fetch didn't
// exist yet in Electron 22 either. net.request also routes through
// Chromium's network stack instead of Node's, which means it picks up
// system proxy settings automatically and does TLS via BoringSSL rather
// than the host OS - a real advantage on Windows 7, whose own TLS stack
// is long unpatched.
function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = net.request(url)

    request.on('response', (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      })
      response.on('error', reject)
    })

    request.on('error', reject)
    request.end()
  })
}

export class OmdbNotFoundError extends Error {}
export class OmdbRateLimitError extends Error {}
export class OmdbAuthError extends Error {}
export class OmdbNetworkError extends Error {}

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

  let response
  try {
    response = await requestJson(`${OMDB_BASE_URL}?${query.toString()}`)
  } catch (error) {
    // DNS failure, no connection, etc. - every remaining lookup would fail
    // identically, so this gets the same "stop the scan" treatment as
    // rate-limit/invalid-key rather than being skipped file-by-file.
    // The underlying message is preserved deliberately: an earlier version
    // swallowed it entirely and reported every failure as a connectivity
    // problem, which hid a "fetch is not defined" bug behind a wrong
    // diagnosis. Never report a cause you haven't actually established.
    throw new OmdbNetworkError(`Could not reach OMDb (${error.message})`)
  }

  // OMDb returns HTTP 401 (not 200) for an invalid key, still with a JSON
  // body - so the body must be inspected before falling back to a generic
  // HTTP-status error, or "invalid key" would look identical to a network
  // failure and never get its own (scan-halting) handling below.
  let data
  try {
    data = JSON.parse(response.body)
  } catch {
    throw new Error(`OMDb returned a non-JSON body (HTTP ${response.status})`)
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

  // Status check by explicit range: requestJson returns a plain
  // { status, body } object, not a fetch Response, so there is no `.ok`
  // here - reading one silently yields undefined and fails every healthy
  // response.
  if (response.status < 200 || response.status >= 300) {
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
