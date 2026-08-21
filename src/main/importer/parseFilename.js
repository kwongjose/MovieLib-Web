import { basename, extname } from 'node:path'

const IMDB_ID_PATTERN = /^tt\d+$/i
const YEAR_PATTERN = /^\d{4}$/

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
    return { title: nameWithoutExt.trim(), year: null, imdbId: null }
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
      ? { title, year: null, imdbId: inner.toLowerCase() }
      : { title, year: inner, imdbId: null }
  }

  // Parens present but none hold a year or IMDb id (e.g. "Title (Special
  // Edition)") - drop the parenthetical and search on the title alone, which
  // is far likelier to match than sending the decoration to OMDb verbatim.
  return { title: beforeFirstGroup || nameWithoutExt.trim(), year: null, imdbId: null }
}
