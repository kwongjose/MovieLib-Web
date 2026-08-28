import { ipcMain } from 'electron'
import { existsSync, unlinkSync, renameSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { getDb } from '../db'
import * as moviesRepo from '../db/movies.repo'
import { listKeyValues } from '../db/omdbKeys.repo'
import { getTmdbKey } from '../db/settings.repo'
import { fetchByImdbId, OmdbRateLimitError, OmdbAuthError } from '../importer/omdbClient'
import { fetchTmdbRecord, mergeOmdbFallbacks, imdbIdLookup } from '../importer/buildMovie'
import { parseFilename } from '../importer/parseFilename'
import { validateBaseName, isCaseOnlyRename, pathTooLong } from '../importer/renameRules'
import { TmdbNotFoundError } from '../importer/tmdbClient'
import { isScanning } from './scan'
import { backfillRatings } from '../importer/backfillRatings'
import { probeResolution } from '../importer/probeVideo'
import { auditMovies } from '../importer/matchAudit'

function requireTmdbKey(db) {
  const key = getTmdbKey(db)
  if (!key) throw new Error('Add a TMDB API key in Settings first.')
  return key
}

// Single-movie lookups walk the same key list as a scan, so one exhausted key
// does not block adding a film by hand.
//
// Best-effort, matching the scanner: TMDB supplies the metadata now, so having
// no usable OMDb key costs the IMDb rating rather than failing the whole add.
async function ratingFromOmdb(db, imdbId) {
  if (!imdbId) return null

  for (const key of listKeyValues(db)) {
    try {
      return await fetchByImdbId(key, imdbId)
    } catch (error) {
      // Try the next key for a spent or rejected one; anything else (not found,
      // network) means OMDb has nothing useful to add for this film.
      if (!(error instanceof OmdbRateLimitError) && !(error instanceof OmdbAuthError)) return null
    }
  }
  return null
}

// Builds the same record the scanner produces, for the "Add by IMDb ID" and
// "refetch" paths. Shared through buildMovie so the two cannot diverge.
async function buildFromImdbId(db, imdbId) {
  const tmdbData = await fetchTmdbRecord(requireTmdbKey(db), imdbIdLookup(imdbId))
  return mergeOmdbFallbacks(tmdbData, await ratingFromOmdb(db, tmdbData.imdb_id || imdbId))
}

// The scanner's record for a discovered file, driven by the filename alone -
// the rename path's refetch. Shared through buildMovie so they cannot diverge.
async function buildFromPath(db, filePath) {
  const tmdbData = await fetchTmdbRecord(requireTmdbKey(db), parseFilename(filePath))
  return mergeOmdbFallbacks(tmdbData, await ratingFromOmdb(db, tmdbData.imdb_id))
}

// Renames the movie's file on disk in place (same directory, same extension),
// then refetches metadata from the new name. Same row throughout, so watched
// state, collections and created_at (the Latest Import marker) all survive.
//
// Ordering matters: fs first, DB second (the movies:delete precedent), and
// once the file has actually been renamed the handler must not reject - a
// failed metadata refetch comes back as a warning instead.
async function renameMovieFile(db, id, newBaseName) {
  const oldPath = moviesRepo.getMoviePath(db, id)
  if (!oldPath) throw new Error('Movie not found.')
  if (isScanning()) throw new Error('A scan is running. Wait for it to finish before renaming.')

  const trimmed = String(newBaseName ?? '').trim()
  const validationError = validateBaseName(trimmed)
  if (validationError) throw new Error(validationError)

  const oldName = basename(oldPath)
  const newName = trimmed + extname(oldPath)
  const targetPath = join(dirname(oldPath), newName)
  if (pathTooLong(targetPath)) throw new Error('The new name makes the path too long for Windows.')

  if (newName === oldName) return { movie: moviesRepo.getMovieById(db, id), warning: null }

  if (moviesRepo.findMovieIdByPathNocase(db, targetPath, id)) {
    throw new Error('Another library entry already uses that file name.')
  }
  // A case-only rename is legal on Windows, but existsSync(target) would see
  // the file itself - NTFS fixes the casing in a single rename call.
  if (!isCaseOnlyRename(oldName, newName) && existsSync(targetPath)) {
    throw new Error('A file with that name already exists in this folder.')
  }
  if (!existsSync(oldPath)) throw new Error('The file no longer exists on disk.')

  try {
    renameSync(oldPath, targetPath)
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      throw new Error('The file is in use by another program. Close any player that has it open and try again.')
    }
    if (error.code === 'ENOENT') throw new Error('The file no longer exists on disk.')
    if (error.code === 'EACCES') throw new Error('Windows denied access to rename this file.')
    throw new Error(`Could not rename the file: ${error.message}`)
  }

  try {
    moviesRepo.updateMovie(db, id, { path: targetPath })
  } catch (error) {
    // Never leave the DB pointing at a name that no longer exists on disk.
    renameSync(targetPath, oldPath)
    throw error
  }

  let warning = null
  try {
    moviesRepo.updateMetadataFields(db, id, await buildFromPath(db, targetPath))
  } catch (error) {
    warning =
      error instanceof TmdbNotFoundError
        ? 'File renamed, but TMDB found no match for the new name. Metadata was left unchanged.'
        : `File renamed, but metadata could not be refreshed (${error.message}). Metadata was left unchanged.`
  }
  return { movie: moviesRepo.getMovieById(db, id), warning }
}

function cleanupMissingFiles() {
  const db = getDb()
  const missingIds = moviesRepo
    .listAllMoviePaths(db)
    .filter((m) => !existsSync(m.path))
    .map((m) => m.id)

  if (missingIds.length) moviesRepo.deleteManyMovies(db, missingIds)
  return { removedCount: missingIds.length, removedIds: missingIds }
}

export function registerMoviesIpc() {
  ipcMain.handle('movies:list', (_e, filters) => moviesRepo.listMovies(getDb(), filters))
  ipcMain.handle('movies:getById', (_e, id) => moviesRepo.getMovieById(getDb(), id))
  ipcMain.handle('movies:create', (_e, payload) => moviesRepo.createMovie(getDb(), payload))
  ipcMain.handle('movies:update', (_e, id, payload) => moviesRepo.updateMovie(getDb(), id, payload))

  ipcMain.handle('movies:createFromImdbId', async (_e, imdbId, path) => {
    const db = getDb()
    const movie = await buildFromImdbId(db, imdbId)
    const resolution = await probeResolution(path)
    return moviesRepo.createMovie(db, { ...movie, ...resolution, path })
  })

  // Refetches fetched-metadata fields only - width/height/resolution_label/path
  // are left untouched (see movies.repo.js updateMetadataFields).
  ipcMain.handle('movies:refetchFromTmdb', async (_e, id, imdbId) => {
    const db = getDb()
    return moviesRepo.updateMetadataFields(db, id, await buildFromImdbId(db, imdbId))
  })

  ipcMain.handle('movies:renameFile', (_e, id, newBaseName) => renameMovieFile(getDb(), id, newBaseName))

  ipcMain.handle('movies:delete', (_e, id, options = {}) => {
    const db = getDb()
    if (options.deleteFile) {
      const path = moviesRepo.getMoviePath(db, id)
      if (path && existsSync(path)) unlinkSync(path)
    }
    moviesRepo.deleteMovie(db, id)
    return { id }
  })

  ipcMain.handle('movies:addActor', (_e, movieId, name) => moviesRepo.addActorToMovie(getDb(), movieId, name))
  ipcMain.handle('movies:removeActor', (_e, movieId, actorId) =>
    moviesRepo.removeActorFromMovie(getDb(), movieId, actorId)
  )

  ipcMain.handle('movies:markWatched', (_e, id, options = {}) =>
    moviesRepo.markMovieWatched(getDb(), id, options.date)
  )
  ipcMain.handle('movies:clearWatched', (_e, id) => moviesRepo.clearMovieWatched(getDb(), id))

  ipcMain.handle('movies:listRatedValues', () => moviesRepo.listRatedValues(getDb()))
  ipcMain.handle('movies:findDuplicates', () => moviesRepo.findDuplicateMovies(getDb()))
  // Pure comparison over rows already in the database - no TMDB call, so this
  // stays synchronous and needs no progress channel, unlike backfillRatings.
  ipcMain.handle('movies:auditMatches', (_e, options) =>
    auditMovies(moviesRepo.listMoviesForMatchAudit(getDb()), options)
  )
  ipcMain.handle('movies:countMissingRatings', () => moviesRepo.countMoviesMissingRating(getDb()))

  // A re-scan never revisits an imported file, so films that missed their rating
  // during a scan can only be filled in here.
  ipcMain.handle('movies:backfillRatings', async (event) => {
    const { sender } = event
    return backfillRatings((progress) => {
      if (!sender.isDestroyed()) sender.send('movies:backfillProgress', progress)
    })
  })

  ipcMain.handle('movies:cleanupMissingFiles', () => cleanupMissingFiles())
  ipcMain.handle('movies:resetLibrary', () => {
    moviesRepo.resetLibrary(getDb())
    return { ok: true }
  })
}
