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
    },
    async removeMovie(collectionId, movieId) {
      await window.api.collections.removeMovie(collectionId, movieId)
    }
  }
})
