import { ipcMain } from 'electron'
import { existsSync, unlinkSync } from 'node:fs'
import { getDb } from '../db'
import * as moviesRepo from '../db/movies.repo'

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

  // movies:createFromImdbId and movies:refetchFromOmdb are registered in Phase 4
  // once importer/omdbClient.js exists to actually call OMDb.

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

  ipcMain.handle('movies:findDuplicates', () => moviesRepo.findDuplicateMovies(getDb()))
  ipcMain.handle('movies:cleanupMissingFiles', () => cleanupMissingFiles())
  ipcMain.handle('movies:resetLibrary', () => {
    moviesRepo.resetLibrary(getDb())
    return { ok: true }
  })
}
