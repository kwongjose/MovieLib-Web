import { defineStore } from 'pinia'

export const useGenresStore = defineStore('genres', {
  state: () => ({ genres: [] }),
  actions: {
    async fetch() {
      this.genres = await window.api.genres.list()
    },
    async add(name) {
      await window.api.genres.add(name)
      await this.fetch()
    },
    async remove(name) {
      await window.api.genres.remove(name)
      await this.fetch()
    }
  }
})
