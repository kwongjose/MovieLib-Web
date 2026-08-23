import { ipcMain } from 'electron'
import { existsSync, unlinkSync } from 'node:fs'
import { getDb } from '../db'
import * as moviesRepo from '../db/movies.repo'
import { listKeyValues } from '../db/omdbKeys.repo'
import { getTmdbKey } from '../db/settings.repo'
import { fetchByImdbId, OmdbRateLimitError, OmdbAuthError } from '../importer/omdbClient'
import { fetchTmdbRecord, mergeOmdbFallbacks, imdbIdLookup } from '../importer/buildMovie'
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
