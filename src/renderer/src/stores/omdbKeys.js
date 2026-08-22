import { defineStore } from 'pinia'

export const useOmdbKeysStore = defineStore('omdbKeys', {
  state: () => ({ keys: [], loaded: false }),
  actions: {
    async fetch() {
      this.keys = await window.api.omdbKeys.list()
      this.loaded = true
    },
    async add(key) {
      await window.api.omdbKeys.add(key)
      await this.fetch()
    },
    async remove(id) {
      await window.api.omdbKeys.remove(id)
      await this.fetch()
    }
  }
})
