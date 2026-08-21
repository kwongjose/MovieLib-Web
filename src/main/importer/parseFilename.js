import { basename, extname } from 'node:path'

const IMDB_ID_PATTERN = /^tt\d+$/i
const YEAR_PATTERN = /^\d{4}$/

// Extension-aware parsing for the three supported filename shapes:
//   "Title.ext"              -> { title, year: null, imdbId: null }
//   "Title (YEAR).ext"       -> { title, year, imdbId: null }
//   "Title (tt1234567).ext"  -> { title, year: null, imdbId }
// Uses path.extname/basename to strip the real extension regardless of its
// length, unlike the original which always stripped exactly 4 characters
// (silently truncating titles for 3-letter extensions like .ts).
export function parseFilename(filePath) {
  const fileName = basename(filePath)
  const ext = extname(fileName)
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName

  const parenMatch = nameWithoutExt.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (!parenMatch) {
    return { title: nameWithoutExt.trim(), year: null, imdbId: null }
  }

  const [, titlePart, inner] = parenMatch
  const trimmedInner = inner.trim()

  if (IMDB_ID_PATTERN.test(trimmedInner)) {
    return { title: titlePart.trim(), year: null, imdbId: trimmedInner.toLowerCase() }
  }

  if (YEAR_PATTERN.test(trimmedInner)) {
    return { title: titlePart.trim(), year: trimmedInner, imdbId: null }
  }

  // Parens present but not a year or an IMDb id (e.g. "Title (Director's Cut)") -
  // treat the whole name as the title rather than guessing which part to keep.
  return { title: nameWithoutExt.trim(), year: null, imdbId: null }
}
