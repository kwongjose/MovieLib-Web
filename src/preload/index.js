import { contextBridge, ipcRenderer } from 'electron'

// Narrow, named, whitelisted surface only - never a raw ipcRenderer.invoke
// passthrough, so the renderer can't invoke arbitrary channels.
const api = {
  movies: {
    list: (filters) => ipcRenderer.invoke('movies:list', filters),
    getById: (id) => ipcRenderer.invoke('movies:getById', id),
    create: (payload) => ipcRenderer.invoke('movies:create', payload),
    update: (id, payload) => ipcRenderer.invoke('movies:update', id, payload),
    delete: (id, options) => ipcRenderer.invoke('movies:delete', id, options),
    addActor: (movieId, name) => ipcRenderer.invoke('movies:addActor', movieId, name),
    removeActor: (movieId, actorId) => ipcRenderer.invoke('movies:removeActor', movieId, actorId),
    markWatched: (id, options) => ipcRenderer.invoke('movies:markWatched', id, options),
    clearWatched: (id) => ipcRenderer.invoke('movies:clearWatched', id),
    findDuplicates: () => ipcRenderer.invoke('movies:findDuplicates'),
    cleanupMissingFiles: () => ipcRenderer.invoke('movies:cleanupMissingFiles'),
    resetLibrary: () => ipcRenderer.invoke('movies:resetLibrary')
    // createFromImdbId / refetchFromOmdb added in Phase 4
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
    getMovies: (collectionId) => ipcRenderer.invoke('collections:getMovies', collectionId)
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    add: () => ipcRenderer.invoke('folders:add'),
    remove: (id) => ipcRenderer.invoke('folders:remove', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (payload) => ipcRenderer.invoke('settings:set', payload)
  },
  system: {
    openFile: (path) => ipcRenderer.invoke('system:openFile', path),
    openContainingFolder: (path) => ipcRenderer.invoke('system:openContainingFolder', path),
    revealDatabaseFile: () => ipcRenderer.invoke('system:revealDatabaseFile')
  },
  // Dev-only channel; the main process only registers a handler for it in
  // unpackaged builds, and the renderer only surfaces it behind import.meta.env.DEV.
  dev: {
    seedFakeMovies: () => ipcRenderer.invoke('dev:seedFakeMovies')
  }
  // scan.* added in Phase 4
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
