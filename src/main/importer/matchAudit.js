import { parseFilename } from './parseFilename'
import { normalizeTitle } from './tmdbLookup'

// The scanner resolves a filename to a TMDB id by scoring search results
// (tmdbLookup.scoreResult) and then throws that score away. When it picks
// wrong, the row that lands in the library looks perfectly healthy - poster,
// plot, cast and rating all present - and nothing ever surfaces it again.
//
// This module recovers the signal after the fact, with no network call: the
// filename is still on the row, so re-parsing it and comparing against the
// stored title/year/imdb_id says whether the two still agree. Measured over a
// real 932-film library, scores cluster at 0-15 for correct rows and 35-55 for
// wrong ones, with nothing in between - see MIN_SCORE.

// Ligatures survive NFD decomposition (ae is a letter in its own right, not
// a + combining e), so they have to be mapped by hand or "Aeon Flux" never
// matches the library's "AEon Flux".
const LIGATURES = [
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ß/g, 'ss'],
  [/ø/g, 'o'],
  [/ł/g, 'l'],
  [/đ/g, 'd']
]

const ROMAN_NUMERALS = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
  viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13
}

// Dropped before comparing token sets. Without this, the two Harry Potter
// titles "and the Chamber of Secrets" and "and the Sorcerer's Stone" share
// five of nine tokens and look like a match; with it they share two of six
// and the difference is unmistakable.
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'part', 'chapter', 'episode'])

// Deliberately a superset of tmdbLookup's normalizeTitle rather than a change
// to it: that function decides which film a scan imports, and widening it
// there would silently alter import behaviour. Every step below fixes a false
// positive observed against a real library.
export function foldTitle(value) {
  let text = String(value || '').toLowerCase()
  for (const [pattern, replacement] of LIGATURES) text = text.replace(pattern, replacement)

  // "Amelie" vs "Amelie" with an accent. normalizeTitle alone yields "am lie",
  // because it replaces any run of non-[a-z0-9] with a space.
  text = text.normalize('NFD').replace(/[̀-ͯ]/g, '')

  // "10000 BC" vs "10,000 BC".
  text = text.replace(/(\d)[,.](\d)/g, '$1$2')

  text = normalizeTitle(text)

  // Punctuation is gone by now, so "G.I. Joe" has become "g i joe" while the
  // filename says "gi joe". Re-joining runs of single letters reconciles the
  // two, and fixes "Babylon A.D." against "babylon ad" at the same time.
  const words = []
  for (const word of text.split(' ').filter(Boolean)) {
    const previous = words[words.length - 1]
    if (word.length === 1 && previous && previous.length === 1) words[words.length - 1] += word
    else words.push(word)
  }

  // "Rocky II" vs "Rocky 2". Trailing only: a numeral mid-title belongs to the
  // title itself, and folding it would stop "Star Wars Episode IV A New Hope"
  // from matching a library row spelled the same way.
  const last = words[words.length - 1]
  if (words.length > 1 && ROMAN_NUMERALS[last] !== undefined) {
    words[words.length - 1] = String(ROMAN_NUMERALS[last])
  }

  return words.join(' ')
}

// Falls back to the full token set when a title is nothing but stopwords
// ("The One", "Up"), so those rows still have something to compare.
export function distinctiveTokens(title) {
  const all = foldTitle(title).split(' ').filter(Boolean)
  const kept = all.filter((word) => !STOPWORDS.has(word))
  return new Set(kept.length ? kept : all)
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / (a.size + b.size - shared)
}

// True when one title's tokens are wholly contained in the other's. That is
// the shape of an alternate or longer title - the full French title of Amelie
// stored as just "Amelie", "Star Wars Episode IV A New Hope" stored as "Star
// Wars" - which is a naming difference, not a wrong film.
function isSubset(a, b) {
  if (!a.size || !b.size) return false
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  for (const token of smaller) if (!larger.has(token)) return false
  return true
}

// parseFilename cannot tell a trailing year from a title that ends in digits,
// and its own `candidates` list does not help here: buildCandidates adds the
// alternate reading only when no year was found, so "Blade Runner 2049.mkv"
// yields exactly one candidate - { title: 'Blade Runner', year: '2049' }. Left
// alone that reads as a 32-year drift against the stored 2017, and every film
// named this way gets flagged. So the second reading is added here instead.
function readings(parsed, movie) {
  const out = []
  const maxYear = new Date().getFullYear() + 1

  for (const candidate of parsed.candidates) {
    out.push(candidate)
    if (!candidate.year) continue

    // Either the number cannot be a release year at all ("Blade Runner 2049"),
    // or the stored title already ends with it ("Death Race 2000", "2012").
    // The second test cannot hide a real mismatch: it only fires when the
    // library's own title carries the same digits the filename does.
    const impossibleYear = Number(candidate.year) > maxYear
    const titleEndsWithIt = foldTitle(movie.title).endsWith(` ${candidate.year}`)
    if (impossibleYear || titleEndsWithIt) {
      out.push({ title: `${candidate.title} ${candidate.year}`, year: null })
    }
  }
  return out
}

// Higher is worse. Weights are set so the mild signals - a dropped subtitle, a
// slight rewording - cannot reach MIN_SCORE on their own, while any single
// strong one does.
function scoreReading(candidate, imdbId, movie) {
  let score = 0
  const reasons = []

  if (imdbId && movie.imdb_id && imdbId.toLowerCase() !== movie.imdb_id.toLowerCase()) {
    score += 60
    reasons.push(`IMDb ID: filename says ${imdbId}, library has ${movie.imdb_id}`)
  }

  const fromFile = foldTitle(candidate.title)
  const inLibrary = foldTitle(movie.title)
  if (fromFile && inLibrary && fromFile !== inLibrary) {
    const fileTokens = distinctiveTokens(candidate.title)
    const libraryTokens = distinctiveTokens(movie.title)

    if (
      fromFile.startsWith(inLibrary) ||
      inLibrary.startsWith(fromFile) ||
      isSubset(fileTokens, libraryTokens)
    ) {
      // One title is the other plus a subtitle. Common, and usually harmless.
      score += 10
    } else {
      const overlap = jaccard(fileTokens, libraryTokens)
      score += overlap >= 0.6 ? 15 : overlap >= 0.3 ? 35 : 55
      if (overlap < 0.6) {
        reasons.push(`Title: filename says "${candidate.title}", library says "${movie.title}"`)
      }
    }
  }

  if (candidate.year && movie.year) {
    const drift = Math.abs(Number(candidate.year) - Number(movie.year))
    // A one-year gap is routine - a festival premiere and a wide release
    // straddle New Year - and scoreResult tolerates it during import too.
    if (drift >= 4) {
      score += 45
      reasons.push(
        `Year: filename says ${candidate.year}, library says ${movie.year} - ${drift} years apart`
      )
    } else if (drift >= 2) {
      score += 25
      reasons.push(`Year: filename says ${candidate.year}, library says ${movie.year}`)
    }
  }

  return { score, reasons }
}

// Below this the flagged list fills with correct rows and stops being worth
// reading. Over a real 932-film library the score histogram was
// { 0: 877, 10: 36, 15: 2, 35: 4, 55: 11 } - nothing at all between 16 and 34,
// so this sits in an empty band rather than on a judgement call.
export const MIN_SCORE = 25

function severityFor(score) {
  if (score >= 55) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

// Returns null when the filename carries too little to judge by - "movie.mkv",
// "9 (tt0472033).avi". Reporting those would be noise: the library metadata may
// well be right, and the file simply says nothing either way.
export function auditMovie(movie) {
  const parsed = parseFilename(movie.path)
  if (distinctiveTokens(parsed.title).size < 2 && !parsed.year) return null

  // Any reading of the filename that agrees with the library clears the row,
  // so the most forgiving one wins.
  return readings(parsed, movie)
    .map((candidate) => scoreReading(candidate, parsed.imdbId, movie))
    .reduce((best, next) => (next.score < best.score ? next : best))
}

export function auditMovies(rows, options = {}) {
  const requested = Number(options.minScore)
  const minScore = requested > 0 ? requested : MIN_SCORE

  const flagged = []
  let unjudgeable = 0

  for (const movie of rows) {
    const verdict = auditMovie(movie)
    if (!verdict) {
      unjudgeable++
      continue
    }
    if (verdict.score < minScore) continue

    flagged.push({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      path: movie.path,
      // Pre-fills the re-match box: a filename carrying an IMDb id already
      // names the film the user meant, so there is nothing to look up by hand.
      imdbIdFromFilename: parseFilename(movie.path).imdbId,
      score: verdict.score,
      severity: severityFor(verdict.score),
      reasons: verdict.reasons
    })
  }

  flagged.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return { flagged, scanned: rows.length, unjudgeable, minScore }
}
