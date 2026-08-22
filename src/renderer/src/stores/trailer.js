import { defineStore } from 'pinia'

// The overlay is mounted once, in App.vue, and driven from here. That is what
// lets the detail dialog and the compare dialog both open a trailer without
// either of them unmounting: nothing in the dialog tree owns the player, so
// closing the trailer returns you to exactly the view you left.
export const useTrailerStore = defineStore('trailer', {
  state: () => ({
    movie: null,
    // Resolved once and cached: the loopback origin and token are fixed for the
    // life of the process, and asking for them is what starts the server.
    base: null,
    token: null,
    error: ''
  }),

  getters: {
    isOpen: (state) => state.movie !== null,

    embedUrl(state) {
      if (!state.movie?.trailer_key || !state.base) return null
      const params = new URLSearchParams({ token: state.token, v: state.movie.trailer_key })
      return `${state.base}/trailer?${params.toString()}`
    },

    // Only ever used for the "Open on YouTube" escape hatch.
    watchUrl: (state) =>
      state.movie?.trailer_key
        ? `https://www.youtube.com/watch?v=${state.movie.trailer_key}`
        : null
  },

  actions: {
    async open(movie) {
      if (!movie?.trailer_key) return
      this.movie = movie
      this.error = ''

      if (this.base) return
      try {
        const { base, token } = await window.api.system.getTrailerBase()
        this.base = base
        this.token = token
      } catch (error) {
        this.error = error.message
      }
    },

    close() {
      // Dropping the movie unmounts the iframe, which is what actually stops
      // playback - there is no way to pause a cross-origin embed on teardown.
      this.movie = null
      this.error = ''
    }
  }
})
