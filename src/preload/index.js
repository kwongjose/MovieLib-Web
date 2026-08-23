import { contextBridge, ipcRenderer } from 'electron'

// Narrow, named, whitelisted surface only - never a raw ipcRenderer.invoke
// passthrough, so the renderer can't invoke arbitrary channels.
const api = {
  movies: {
    list: (filters) => ipcRenderer.invoke('movies:list', filters),
    getById: (id) => ipcRenderer.invoke('movies:getById', id),
    create: (payload) => ipcRenderer.invoke('movies:create', payload),
    createFromImdbId: (imdbId, path) => ipcRenderer.invoke('movies:createFromImdbId', imdbId, path),
    update: (id, payload) => ipcRenderer.invoke('movies:update', id, payload),
    refetchFromTmdb: (id, imdbId) => ipcRenderer.invoke('movies:refetchFromTmdb', id, imdbId),
    delete: (id, options) => ipcRenderer.invoke('movies:delete', id, options),
    addActor: (movieId, name) => ipcRenderer.invoke('movies:addActor', movieId, name),
    removeActor: (movieId, actorId) => ipcRenderer.invoke('movies:removeActor', movieId, actorId),
    markWatched: (id, options) => ipcRenderer.invoke('movies:markWatched', id, options),
    clearWatched: (id) => ipcRenderer.invoke('movies:clearWatched', id),
    listRatedValues: () => ipcRenderer.invoke('movies:listRatedValues'),
    findDuplicates: () => ipcRenderer.invoke('movies:findDuplicates'),
    auditMatches: (options) => ipcRenderer.invoke('movies:auditMatches', options),
    countMissingRatings: () => ipcRenderer.invoke('movies:countMissingRatings'),
    backfillRatings: () => ipcRenderer.invoke('movies:backfillRatings'),
    onBackfillProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('movies:backfillProgress', listener)
      return () => ipcRenderer.removeListener('movies:backfillProgress', listener)
    },
    cleanupMissingFiles: () => ipcRenderer.invoke('movies:cleanupMissingFiles'),
    resetLibrary: () => ipcRenderer.invoke('movies:resetLibrary')
  },
  genres: {
    list: () => ipcRenderer.invoke('genres:list'),
    add: (name) => ipcRenderer.invoke('genres:add', name),
    remove: (name) => ipcRenderer.invoke('genres:remove', name)
  },
  collections: {
    list: () => ipcRenderer.invoke('collections:list'),
    create: (name) => ipcRenderer.invoke('collections:create', name),
    rename: (id, name) => ipcRenderer.invoke('collections:rename', id, name),
    delete: (id) => ipcRenderer.invoke('collections:delete', id),
    addMovie: (collectionId, movieId) => ipcRenderer.invoke('collections:addMovie', collectionId, movieId),
    removeMovie: (collectionId, movieId) => ipcRenderer.invoke('collections:removeMovie', collectionId, movieId),
    addMovieByName: (name, movieId) => ipcRenderer.invoke('collections:addMovieByName', name, movieId),
    getMovies: (collectionId) => ipcRenderer.invoke('collections:getMovies', collectionId),
    countSmall: (minMovies) => ipcRenderer.invoke('collections:countSmall', minMovies),
    deleteSmall: (minMovies) => ipcRenderer.invoke('collections:deleteSmall', minMovies),
    clearAll: () => ipcRenderer.invoke('collections:clearAll')
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    add: () => ipcRenderer.invoke('folders:add'),
    remove: (id) => ipcRenderer.invoke('folders:remove', id)
  },
  scan: {
    start: () => ipcRenderer.invoke('scan:start'),
    findNotImported: () => ipcRenderer.invoke('scan:findNotImported'),
    onProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('scan:progress', listener)
      return () => ipcRenderer.removeListener('scan:progress', listener)
    }
  },
  omdbKeys: {
    list: () => ipcRenderer.invoke('omdbKeys:list'),
    add: (key) => ipcRenderer.invoke('omdbKeys:add', key),
    remove: (id) => ipcRenderer.invoke('omdbKeys:remove', id)
  },
  system: {
    openFile: (path) => ipcRenderer.invoke('system:openFile', path),
    openContainingFolder: (path) => ipcRenderer.invoke('system:openContainingFolder', path),
    revealDatabaseFile: () => ipcRenderer.invoke('system:revealDatabaseFile'),
    getTrailerBase: () => ipcRenderer.invoke('system:getTrailerBase'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url)
  },
  settings: {
    getTmdbKey: () => ipcRenderer.invoke('settings:getTmdbKey'),
    setTmdbKey: (key) => ipcRenderer.invoke('settings:setTmdbKey', key),
    testTmdbKey: (key) => ipcRenderer.invoke('settings:testTmdbKey', key)
  },
  // Dev-only channel; the main process only registers a handler for it in
  // unpackaged builds, and the renderer only surfaces it behind import.meta.env.DEV.
  dev: {
    seedFakeMovies: () => ipcRenderer.invoke('dev:seedFakeMovies')
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
