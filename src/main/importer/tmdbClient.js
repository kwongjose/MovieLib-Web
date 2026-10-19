import { net } from 'electron'
import { log, describeError } from '../log'
import { redactUrl } from '../log/redact'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

// net.request has no built-in timeout. Without one a half-open connection
// holds a scan concurrency permit forever, which is exactly how a scan appears
// to hang at "412 of 900" with no error.
const REQUEST_TIMEOUT_MS = 15000

// TMDB's limit sits around 40 req/sec; at concurrency 5 we are nowhere near it,
// so a 429 means something unusual and a couple of polite retries is right.
const MAX_RATE_LIMIT_RETRIES = 3

export class TmdbNotFoundError extends Error {}
export class TmdbRateLimitError extends Error {}
export class TmdbAuthError extends Error {}
export class TmdbNetworkError extends Error {}

// TMDB issues two credentials for one account: a 32-hex v3 API key that goes in
// the query string, and a much longer v4 read access token (a JWT) that goes in
// an Authorization header. Both are valid; sending one the other's way returns
// 401 "Invalid API key", which reads like a bad credential rather than a bad
// transport. Detecting the JWT prefix means either value pasted into Settings
// simply works.
function isReadAccessToken(credential) {
  return /^ey[A-Za-z0-9_-]+\./.test(credential)
}

// Same rationale as omdbClient.requestJson - Electron 22 bundles Node 16, where
// global fetch is undefined, and net.fetch did not exist yet either. Chromium's
// stack also picks up system proxy settings and negotiates TLS via BoringSSL
// rather than Windows 7's long-unpatched provider. It transparently requests
// and decodes gzip, which matters here: the appended credits block is 251 KB
// raw but 39 KB on the wire.
function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    for (const [name, value] of Object.entries(headers)) request.setHeader(name, value)

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      request.abort()
      reject(new Error(`timed out after ${REQUEST_TIMEOUT_MS} ms`))
    }, REQUEST_TIMEOUT_MS)

    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(arg)
    }

    request.on('response', (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () =>
        finish(resolve, {
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        })
      )
      response.on('error', (error) => finish(reject, error))
    })

    request.on('error', (error) => finish(reject, error))
    request.end()
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callTmdbRaw(credential, path, params, context) {
  const query = new URLSearchParams({ language: 'en-US', ...params })
  const headers = { Accept: 'application/json' }

  if (isReadAccessToken(credential)) {
    headers.Authorization = `Bearer ${credential}`
  } else {
    query.set('api_key', credential)
  }

  const url = `${TMDB_BASE_URL}${path}?${query.toString()}`
  context.url = url

  for (let attempt = 0; ; attempt += 1) {
    let response
    try {
      response = await requestJson(url, headers)
    } catch (error) {
      // DNS failure, no route, timeout - every remaining lookup would fail the
      // same way, so this is a stop-the-scan condition rather than a per-file
      // skip. The underlying message is kept: reporting a cause you have not
      // established is how a "fetch is not defined" bug once got misdiagnosed
      // as a connectivity problem in the OMDb client.
      throw new TmdbNetworkError(`Could not reach TMDB (${error.message})`)
    }

    context.status = response.status

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = parseInt(response.headers['retry-after'], 10)
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * (attempt + 1))
      continue
    }

    let data
    try {
      data = JSON.parse(response.body)
    } catch {
      throw new Error(`TMDB returned a non-JSON body (HTTP ${response.status})`)
    }

    if (response.status === 401 || response.status === 403) {
      throw new TmdbAuthError(data.status_message || 'TMDB rejected the API key')
    }
    if (response.status === 404) {
      throw new TmdbNotFoundError(data.status_message || 'Not found')
    }
    if (response.status === 429) {
      throw new TmdbRateLimitError(data.status_message || 'TMDB rate limit reached')
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`TMDB request failed: HTTP ${response.status}`)
    }

    return data
  }
}

// Single funnel for every TMDB failure, so a throw site added later cannot
// escape the log. The URL is redacted here for readability; the logger scrubs
// every line again anyway, which is what covers the v4 read token - that one
// travels in an Authorization header and never appears in the URL at all.
async function callTmdb(credential, path, params = {}) {
  const startedAt = Date.now()
  const context = {}
  try {
    return await callTmdbRaw(credential, path, params, context)
  } catch (error) {
    // A file with no TMDB match is routine and there can be hundreds of them
    // in one scan, so that case is debug rather than warn.
    const level = error instanceof TmdbNotFoundError ? 'debug' : 'warn'
    log[level]('tmdb', `${path} failed after ${Date.now() - startedAt} ms`, {
      url: redactUrl(context.url),
      status: context.status ?? null,
      ...describeError(error)
    })
    throw error
  }
}

// --- lookups -------------------------------------------------------------

export async function findByImdbId(credential, imdbId) {
  const data = await callTmdb(credential, `/find/${encodeURIComponent(imdbId)}`, {
    external_source: 'imdb_id'
  })
  const movie = data.movie_results?.[0]
  if (!movie) throw new TmdbNotFoundError(`No TMDB movie for ${imdbId}`)
  // media_type is returned rather than assumed, so adding TV later is a branch
  // here instead of a rewrite.
  return { tmdbId: movie.id, mediaType: 'movie' }
}

export function searchMovie(credential, title, params = {}) {
  return callTmdb(credential, '/search/movie', {
    query: title,
    include_adult: 'false',
    ...params
  })
}

// Cheapest possible round trip that still exercises authentication. Movie 550
// is Fight Club - a record that has existed for the life of the API.
export async function verifyCredential(credential) {
  await callTmdb(credential, '/movie/550')
  return true
}

export function getMovieDetails(credential, tmdbId) {
  // One call for everything: details, trailers, cast, certificate and external
  // ids. Splitting these into four requests would quadruple the call count for
  // ~12 KB of extra gzipped payload.
  return callTmdb(credential, `/movie/${tmdbId}`, {
    append_to_response: 'videos,credits,release_dates,external_ids'
  })
}
