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
    async rename(id, name) {
      await window.api.collections.rename(id, name)
      await this.fetch()
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
