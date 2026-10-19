import { contextBridge, ipcRenderer } from 'electron'
import { cleanIpcErrorMessage } from './ipcError'

// Central, so every channel - including ones added later - gets the cleaned
// message, and no renderer view has to know Electron's wrapper format exists.
function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((error) => {
    throw new Error(cleanIpcErrorMessage(error?.message))
  })
}

// Narrow, named, whitelisted surface only - never a raw ipcRenderer.invoke
// passthrough, so the renderer can't invoke arbitrary channels.
const api = {
  movies: {
    list: (filters) => invoke('movies:list', filters),
    getById: (id) => invoke('movies:getById', id),
    create: (payload) => invoke('movies:create', payload),
    createFromImdbId: (imdbId, path) => invoke('movies:createFromImdbId', imdbId, path),
    update: (id, payload) => invoke('movies:update', id, payload),
    refetchFromTmdb: (id, imdbId) => invoke('movies:refetchFromTmdb', id, imdbId),
    renameFile: (id, newBaseName) => invoke('movies:renameFile', id, newBaseName),
    delete: (id, options) => invoke('movies:delete', id, options),
    addActor: (movieId, name) => invoke('movies:addActor', movieId, name),
    removeActor: (movieId, actorId) => invoke('movies:removeActor', movieId, actorId),
    markWatched: (id, options) => invoke('movies:markWatched', id, options),
    clearWatched: (id) => invoke('movies:clearWatched', id),
    listRatedValues: () => invoke('movies:listRatedValues'),
    findDuplicates: () => invoke('movies:findDuplicates'),
    auditMatches: (options) => invoke('movies:auditMatches', options),
    countMissingRatings: () => invoke('movies:countMissingRatings'),
    backfillRatings: () => invoke('movies:backfillRatings'),
    onBackfillProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('movies:backfillProgress', listener)
      return () => ipcRenderer.removeListener('movies:backfillProgress', listener)
    },
    cleanupMissingFiles: () => invoke('movies:cleanupMissingFiles'),
    resetLibrary: () => invoke('movies:resetLibrary')
  },
  genres: {
    list: () => invoke('genres:list'),
    add: (name) => invoke('genres:add', name),
    remove: (name) => invoke('genres:remove', name)
  },
  collections: {
    list: () => invoke('collections:list'),
    create: (name) => invoke('collections:create', name),
    rename: (id, name) => invoke('collections:rename', id, name),
    delete: (id) => invoke('collections:delete', id),
    addMovie: (collectionId, movieId) => invoke('collections:addMovie', collectionId, movieId),
    removeMovie: (collectionId, movieId) => invoke('collections:removeMovie', collectionId, movieId),
    addMovieByName: (name, movieId) => invoke('collections:addMovieByName', name, movieId),
    addMoviesByName: (name, movieIds) => invoke('collections:addMoviesByName', name, movieIds),
    removeMovies: (collectionId, movieIds) =>
      invoke('collections:removeMovies', collectionId, movieIds),
    listForMovies: (movieIds) => invoke('collections:listForMovies', movieIds),
    getMovies: (collectionId) => invoke('collections:getMovies', collectionId),
    countSmall: (minMovies) => invoke('collections:countSmall', minMovies),
    deleteSmall: (minMovies) => invoke('collections:deleteSmall', minMovies),
    clearAll: () => invoke('collections:clearAll')
  },
  folders: {
    list: () => invoke('folders:list'),
    add: () => invoke('folders:add'),
    remove: (id) => invoke('folders:remove', id)
  },
  scan: {
    start: () => invoke('scan:start'),
    findNotImported: () => invoke('scan:findNotImported'),
    onProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('scan:progress', listener)
      return () => ipcRenderer.removeListener('scan:progress', listener)
    }
  },
  omdbKeys: {
    list: () => invoke('omdbKeys:list'),
    add: (key) => invoke('omdbKeys:add', key),
    remove: (id) => invoke('omdbKeys:remove', id)
  },
  system: {
    openFile: (path) => invoke('system:openFile', path),
    openContainingFolder: (path) => invoke('system:openContainingFolder', path),
    revealDatabaseFile: () => invoke('system:revealDatabaseFile'),
    revealLogFile: () => invoke('system:revealLogFile'),
    getTrailerBase: () => invoke('system:getTrailerBase'),
    openExternal: (url) => invoke('system:openExternal', url)
  },
  settings: {
    getTmdbKey: () => invoke('settings:getTmdbKey'),
    setTmdbKey: (key) => invoke('settings:setTmdbKey', key),
    testTmdbKey: (key) => invoke('settings:testTmdbKey', key)
  },
  // Dev-only channel; the main process only registers a handler for it in
  // unpackaged builds, and the renderer only surfaces it behind import.meta.env.DEV.
  dev: {
    seedFakeMovies: () => invoke('dev:seedFakeMovies')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
