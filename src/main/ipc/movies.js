import { ipcMain } from 'electron'
import { existsSync, unlinkSync } from 'node:fs'
import { getDb } from '../db'
import * as moviesRepo from '../db/movies.repo'
import { getSettings } from '../db/settings.repo'
import { fetchByImdbId } from '../importer/omdbClient'
import { probeResolution } from '../importer/probeVideo'

function requireApiKey(db) {
  const { omdbApiKey } = getSettings(db)
  if (!omdbApiKey) throw new Error('Set an OMDb API key in Settings first.')
  return omdbApiKey
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
    const apiKey = requireApiKey(db)
    const omdbData = await fetchByImdbId(apiKey, imdbId)
    const resolution = await probeResolution(path)
    return moviesRepo.createMovie(db, { ...omdbData, ...resolution, path })
  })

  // Refetches OMDb-sourced fields only - width/height/resolution_label/path
  // are left untouched (see movies.repo.js updateOmdbFields).
  ipcMain.handle('movies:refetchFromOmdb', async (_e, id, imdbId) => {
    const db = getDb()
    const apiKey = requireApiKey(db)
    const omdbData = await fetchByImdbId(apiKey, imdbId)
    return moviesRepo.updateOmdbFields(db, id, omdbData)
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
  ipcMain.handle('movies:cleanupMissingFiles', () => cleanupMissingFiles())
  ipcMain.handle('movies:resetLibrary', () => {
    moviesRepo.resetLibrary(getDb())
    return { ok: true }
  })
}
