import { ipcMain } from 'electron'
import { getDb } from '../db'
import {
  listCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  addMovieToCollection,
  removeMovieFromCollection
} from '../db/collections.repo'
import { listMovies } from '../db/movies.repo'

export function registerCollectionsIpc() {
  ipcMain.handle('collections:list', () => listCollections(getDb()))
  ipcMain.handle('collections:create', (_e, name) => {
    const id = createCollection(getDb(), name)
    return { id, name: name.trim() }
  })
  ipcMain.handle('collections:rename', (_e, id, name) => {
    renameCollection(getDb(), id, name)
    return { ok: true }
  })
  ipcMain.handle('collections:delete', (_e, id) => {
    deleteCollection(getDb(), id)
    return { ok: true }
  })
  ipcMain.handle('collections:addMovie', (_e, collectionId, movieId) => {
    addMovieToCollection(getDb(), collectionId, movieId)
    return { ok: true }
  })
  ipcMain.handle('collections:removeMovie', (_e, collectionId, movieId) => {
    removeMovieFromCollection(getDb(), collectionId, movieId)
    return { ok: true }
  })
  ipcMain.handle('collections:getMovies', (_e, collectionId) =>
    listMovies(getDb(), { collectionIds: [collectionId] })
  )
}
