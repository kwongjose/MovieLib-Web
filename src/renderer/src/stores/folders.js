import { defineStore } from 'pinia'

export const useFoldersStore = defineStore('folders', {
  state: () => ({ folders: [] }),
  actions: {
    async fetch() {
      this.folders = await window.api.folders.list()
    },
    async add() {
      const added = await window.api.folders.add()
      if (added) await this.fetch()
      return added
    },
    async remove(id) {
      await window.api.folders.remove(id)
      await this.fetch()
    }
  }
})
