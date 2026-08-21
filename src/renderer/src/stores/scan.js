import { defineStore } from 'pinia'

let unsubscribe = null

export const useScanStore = defineStore('scan', {
  state: () => ({
    scanning: false,
    progress: null, // { current, total, currentFile }
    result: null,
    error: null
  }),
  actions: {
    subscribe() {
      if (unsubscribe) return
      unsubscribe = window.api.scan.onProgress((progress) => {
        this.progress = progress
      })
    },
    async start() {
      this.subscribe()
      this.scanning = true
      this.error = null
      this.result = null
      this.progress = null
      try {
        this.result = await window.api.scan.start()
      } catch (error) {
        this.error = error.message ?? String(error)
      } finally {
        this.scanning = false
      }
    },
    dismiss() {
      this.result = null
      this.error = null
    }
  }
})
