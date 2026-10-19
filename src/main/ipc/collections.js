import { handle } from './handle'
import { getDb } from '../db'
import {
  listCollections,
  createCollection,
  findOrCreateCollection,
  normalizeCollectionName,
  renameCollection,
  deleteCollection,
  addMovieToCollection,
  removeMovieFromCollection,
  addMoviesToCollection,
  removeMoviesFromCollection,
  listCollectionsForMovies,
  countSmallCollections,
  deleteSmallCollections,
  deleteAllCollections
} from '../db/collections.repo'
import { listMovies } from '../db/movies.repo'

export function registerCollectionsIpc() {
  handle('collections:list', () => listCollections(getDb()))
  // The echoed name is normalized, not merely trimmed: the renderer has to show
  // the name the row actually got, or "Thor Collection" would appear in the UI
  // next to a "Thor" in the database.
  handle('collections:create', (_e, name) => {
    const id = createCollection(getDb(), name)
    return { id, name: normalizeCollectionName(name) }
  })
  // Returns the rename result rather than { ok: true }: a rename onto an
  // existing name merges, and the caller needs to know the surviving id.
  handle('collections:rename', (_e, id, name) => renameCollection(getDb(), id, name))
  handle('collections:delete', (_e, id) => {
    deleteCollection(getDb(), id)
    return { ok: true }
  })
  handle('collections:addMovie', (_e, collectionId, movieId) => {
    addMovieToCollection(getDb(), collectionId, movieId)
    return { ok: true }
  })
  handle('collections:removeMovie', (_e, collectionId, movieId) => {
    removeMovieFromCollection(getDb(), collectionId, movieId)
    return { ok: true }
  })
  // One channel rather than create-then-link from the renderer: `collections`
  // is UNIQUE COLLATE NOCASE, so a two-step add would throw on any name that
  // already exists in a different case. findOrCreateCollection is the same pair
  // the importer links franchises with.
  handle('collections:addMovieByName', (_e, name, movieId) => {
    const db = getDb()
    const collectionId = findOrCreateCollection(db, name)
    if (!collectionId) return null
    addMovieToCollection(db, collectionId, movieId)
    return { id: collectionId, name: normalizeCollectionName(name) }
  })
  // The bulk twin of addMovieByName. One round trip for the whole ticked set,
  // so the store re-fetches its list once instead of once per film.
  handle('collections:addMoviesByName', (_e, name, movieIds) => {
    const db = getDb()
    const collectionId = findOrCreateCollection(db, name)
    if (!collectionId) return null
    const added = addMoviesToCollection(db, collectionId, movieIds)
    return { id: collectionId, name: normalizeCollectionName(name), added }
  })
  handle('collections:removeMovies', (_e, collectionId, movieIds) => ({
    removed: removeMoviesFromCollection(getDb(), collectionId, movieIds)
  }))
  handle('collections:listForMovies', (_e, movieIds) => listCollectionsForMovies(getDb(), movieIds))
  handle('collections:getMovies', (_e, collectionId) =>
    listMovies(getDb(), { collectionIds: [collectionId] })
  )

  handle('collections:countSmall', (_e, minMovies) => countSmallCollections(getDb(), minMovies))
  handle('collections:deleteSmall', (_e, minMovies) => ({
    deletedCount: deleteSmallCollections(getDb(), minMovies)
  }))
  handle('collections:clearAll', () => ({ deletedCount: deleteAllCollections(getDb()) }))
}
