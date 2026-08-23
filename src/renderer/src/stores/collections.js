import { defineStore } from 'pinia'

export const useCollectionsStore = defineStore('collections', {
  state: () => ({ collections: [] }),
  actions: {
    async fetch() {
      this.collections = await window.api.collections.list()
    },
    async create(name) {
      const created = await window.api.collections.create(name)
      await this.fetch()
      return created
    },
    // Returns { id, name, merged } - a rename onto an existing name merges the
    // two, so the caller may be holding a collection id that no longer exists.
    async rename(id, name) {
      const result = await window.api.collections.rename(id, name)
      await this.fetch()
      return result
    },
    async remove(id) {
      await window.api.collections.delete(id)
      await this.fetch()
    },
    async addMovie(collectionId, movieId) {
      await window.api.collections.addMovie(collectionId, movieId)
      await this.fetch()
    },
    async removeMovie(collectionId, movieId) {
      await window.api.collections.removeMovie(collectionId, movieId)
      // Counts moved, and the name may have been the collection's last film.
      await this.fetch()
    },
    // Re-fetches because the name may not have existed yet - a collection
    // created this way has to show up in the filter dropdown without a restart.
    async addMovieByName(name, movieId) {
      const linked = await window.api.collections.addMovieByName(name, movieId)
      await this.fetch()
      return linked
    },
    // The bulk pair. Each does a single fetch() at the end - the whole reason
    // the batch channels exist, since looping the per-movie actions would cost
    // one IPC round trip *and* one full list re-fetch per film.
    async addMoviesByName(name, movieIds) {
      const linked = await window.api.collections.addMoviesByName(name, movieIds)
      await this.fetch()
      return linked
    },
    async removeMovies(collectionId, movieIds) {
      const result = await window.api.collections.removeMovies(collectionId, movieIds)
      await this.fetch()
      return result
    },
    async deleteSmall(minMovies) {
      const result = await window.api.collections.deleteSmall(minMovies)
      await this.fetch()
      return result
    },
    async clearAll() {
      const result = await window.api.collections.clearAll()
      await this.fetch()
      return result
    }
  }
})
