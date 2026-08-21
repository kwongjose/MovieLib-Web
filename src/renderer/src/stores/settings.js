import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({ omdbApiKey: null, loaded: false }),
  actions: {
    async fetch() {
      const settings = await window.api.settings.get()
      this.omdbApiKey = settings.omdbApiKey
      this.loaded = true
    },
    async save(omdbApiKey) {
      const settings = await window.api.settings.set({ omdbApiKey })
      this.omdbApiKey = settings.omdbApiKey
    }
  }
})
