import { ipcMain } from 'electron'
import { getDb } from '../db'
import {
  listCollections,
  createCollection,
  findOrCreateCollection,
  renameCollection,
  deleteCollection,
  addMovieToCollection,
  removeMovieFromCollection,
  countSmallCollections,
  deleteSmallCollections,
  deleteAllCollections
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
  // One channel rather than create-then-link from the renderer: `collections`
  // is UNIQUE COLLATE NOCASE, so a two-step add would throw on any name that
  // already exists in a different case. findOrCreateCollection is the same pair
  // the importer links franchises with.
  ipcMain.handle('collections:addMovieByName', (_e, name, movieId) => {
    const db = getDb()
    const collectionId = findOrCreateCollection(db, name)
    if (!collectionId) return null
    addMovieToCollection(db, collectionId, movieId)
    return { id: collectionId, name: name.trim() }
  })
  ipcMain.handle('collections:getMovies', (_e, collectionId) =>
    listMovies(getDb(), { collectionIds: [collectionId] })
  )

  ipcMain.handle('collections:countSmall', (_e, minMovies) => countSmallCollections(getDb(), minMovies))
  ipcMain.handle('collections:deleteSmall', (_e, minMovies) => ({
    deletedCount: deleteSmallCollections(getDb(), minMovies)
  }))
  ipcMain.handle('collections:clearAll', () => ({ deletedCount: deleteAllCollections(getDb()) }))
}
