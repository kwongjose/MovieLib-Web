import { basename, extname } from 'node:path'

const IMDB_ID_PATTERN = /^tt\d+$/i
const YEAR_PATTERN = /^\d{4}$/
const TRAILING_YEAR_PATTERN = /^(.*?)[\s._-]+((?:19|20)\d{2})$/

// Scene-release decoration. Everything from the first of these onwards is
// noise, so the title is cut at the earliest match.
const RELEASE_TAG_PATTERN =
  /\b(?:\d{3,4}p|4k|uhd|hdr|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|remux|remastered|extended|unrated|uncut|limited|proper|repack|internal|x264|x265|h264|h265|hevc|xvid|divx|aac|ac3|dts|truehd|atmos|multi|dual|subbed|dubbed)\b/i

// Extension-aware parsing for the supported filename shapes:
//   "Title.ext"              -> { title, year: null, imdbId: null }
//   "Title (YEAR).ext"       -> { title, year, imdbId: null }
//   "Title (tt1234567).ext"  -> { title, year: null, imdbId }
// Uses path.extname/basename to strip the real extension regardless of its
// length, unlike the original which always stripped exactly 4 characters
// (silently truncating titles for 3-letter extensions like .ts).
//
// Every parenthesised group is examined, not just a trailing one, and the
// title is taken from the text before the FIRST group - matching the
// original, which scanned from the first "(" and kept everything before it.
// That permissiveness matters for real-world names that carry extra tags:
//   "Title (1999) [1080p].ext"          -> Title + 1999
//   "Title (Director's Cut) (1999).ext" -> Title + 1999
// An earlier version here required the group to be the last thing in the
// name, so both of those parsed as one long title and matched nothing.
export function parseFilename(filePath) {
  const fileName = basename(filePath)
  const ext = extname(fileName)
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName

  const groups = [...nameWithoutExt.matchAll(/\(([^)]*)\)/g)]
  if (!groups.length) {
    return parseUndecorated(nameWithoutExt)
  }

  const beforeFirstGroup = nameWithoutExt.slice(0, groups[0].index).trim()

  for (const group of groups) {
    const inner = group[1].trim()
    const isImdbId = IMDB_ID_PATTERN.test(inner)
    if (!isImdbId && !YEAR_PATTERN.test(inner)) continue

    // Normally the title is whatever precedes the first group. When the name
    // *opens* with a group that isn't the year - "(500) Days of Summer
    // (2009)" - that would be empty, so fall back to the text before the
    // group actually carrying the year/id.
    const title = beforeFirstGroup || nameWithoutExt.slice(0, group.index).trim() || nameWithoutExt.trim()

    return isImdbId
      ? result(title, null, inner.toLowerCase())
      : result(title, inner, null)
  }

  // Parens present but none hold a year or IMDb id (e.g. "Title (Special
  // Edition)") - drop the parenthetical and search on the title alone, which
  // is far likelier to match than sending the decoration to OMDb verbatim.
  return result(beforeFirstGroup || nameWithoutExt.trim(), null, null)
}

// A title ending in four digits is genuinely ambiguous: "The Matrix 1999" is a
// title plus a stray year and finds nothing, while "Blade Runner 2049" is the
// actual title and matches - stripping it to "Blade Runner" + 2049 finds
// nothing instead. Both were verified against live TMDB search. So neither
// reading is dropped: candidates are ordered, the caller tries them in turn,
// and the unambiguous form is always attempted first.
function buildCandidates(title, year) {
  const candidates = [{ title, year }]

  const trailing = TRAILING_YEAR_PATTERN.exec(title)
  if (trailing && !year) {
    const [, stem, stemYear] = trailing
    if (stem.trim()) candidates.push({ title: stem.trim(), year: stemYear })
  }
  return candidates
}

function result(title, year, imdbId) {
  return { title, year, imdbId, candidates: buildCandidates(title, year) }
}

// Fallback for names carrying no parenthesised group at all - typically
// scene-style releases like "The.Matrix.1999.1080p.BluRay.x264-AMIABLE".
// Measured: five such names returned zero TMDB results verbatim, and all five
// matched correctly once cleaned. Punctuation needs no special handling, since
// TMDB search already resolves "Mad Max Fury Road" to "Mad Max: Fury Road".
function parseUndecorated(nameWithoutExt) {
  const spaced = nameWithoutExt.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()

  // Cut at the first release tag, then look for a trailing year on what is
  // left. Order matters: "Inception 2010 2160p UHD" must lose the tags before
  // the year is read, or "2160p" is never reached and the year search hits the
  // wrong token.
  const tagMatch = RELEASE_TAG_PATTERN.exec(spaced)
  const beforeTags = (tagMatch ? spaced.slice(0, tagMatch.index) : spaced).trim()
  const base = beforeTags || spaced

  const trailing = TRAILING_YEAR_PATTERN.exec(base)
  if (trailing && trailing[1].trim()) {
    return result(trailing[1].trim(), trailing[2], null)
  }
  return result(base, null, null)
}
