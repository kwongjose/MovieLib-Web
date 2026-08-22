import { findByImdbId, searchMovie, TmdbNotFoundError } from './tmdbClient'

// Punctuation and case are stripped before comparing, because TMDB's canonical
// titles carry punctuation filenames rarely do: "Mad Max Fury Road" has to be
// recognised as an exact hit for "Mad Max: Fury Road", not a fuzzy one.
function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function releaseYear(result) {
  return result.release_date ? parseInt(result.release_date.slice(0, 4), 10) : null
}

// search/movie is fuzzy and ranks by popularity, which is wrong for a library:
// "Dune" + year 2021 returns the 1984 film second, and a query for an obscure
// title can put a popular unrelated one first. Title equality dominates, year
// proximity breaks ties, and popularity only separates otherwise-equal matches.
function scoreResult(result, title, year) {
  const wanted = normalizeTitle(title)
  const got = normalizeTitle(result.title)
  const original = normalizeTitle(result.original_title)

  let score = 0
  if (got === wanted || original === wanted) score += 1000
  else if (got.startsWith(wanted) || wanted.startsWith(got)) score += 400
  else if (got.includes(wanted) || wanted.includes(got)) score += 150

  if (year) {
    const found = releaseYear(result)
    if (found) {
      const drift = Math.abs(found - Number(year))
      // A year is often off by one between a festival and a wide release, so
      // near misses are tolerated rather than disqualifying.
      score += drift === 0 ? 300 : Math.max(0, 120 - drift * 40)
    }
  }

  score += Math.min(50, (result.popularity || 0) / 2)
  return score
}

function bestMatch(results, title, year) {
  if (!results?.length) return null
  return [...results].sort((a, b) => scoreResult(b, title, year) - scoreResult(a, title, year))[0]
}

// primary_release_year is strict, year matches any release in that year, and
// dropping the year entirely is the last resort. Verified: "Dune" with
// primary_release_year=2021 isolates the remake, while plain year=2021 still
// lets the 1984 film through - so the strict form is tried first and the
// looser ones only if it finds nothing.
function searchAttempts(candidate) {
  if (!candidate.year) return [{}]
  return [
    { primary_release_year: candidate.year },
    { year: candidate.year },
    {}
  ]
}

// Resolves a parsed filename to a TMDB id. An IMDb id in the filename is
// authoritative and skips searching entirely; otherwise every parsed title
// candidate is tried against the year ladder. Candidates exist because a title
// ending in four digits is ambiguous - see parseFilename.
export async function resolveTmdbId(credential, parsed) {
  if (parsed.imdbId) {
    try {
      return await findByImdbId(credential, parsed.imdbId)
    } catch (error) {
      // A filename can carry an IMDb id TMDB has never heard of. That is worth
      // falling back from, not failing on - but only for "not found"; auth and
      // network problems must keep propagating.
      if (!(error instanceof TmdbNotFoundError)) throw error
    }
  }

  for (const candidate of parsed.candidates) {
    if (!candidate.title) continue
    for (const params of searchAttempts(candidate)) {
      const data = await searchMovie(credential, candidate.title, params)
      const match = bestMatch(data.results, candidate.title, candidate.year)
      if (match) return { tmdbId: match.id, mediaType: 'movie' }
    }
  }

  throw new TmdbNotFoundError(`No TMDB match for "${parsed.title}"`)
}

export { normalizeTitle, scoreResult, bestMatch }
