import { defineStore } from 'pinia'

const SEARCH_DEBOUNCE_MS = 300
let searchTimer = null

function defaultFilters() {
  return {
    search: '',
    genreIds: [],
    decades: [],
    ratingBuckets: [],
    collectionIds: [],
    watched: null,
    sortBy: 'title',
    sortDir: 'asc'
  }
}

// The single query endpoint everything funnels through: every filter/search/
// sort change re-issues movies.list() with the FULL current filter state
// against the full library - never a client-side subset of a prior result.
export const useMoviesStore = defineStore('movies', {
  state: () => ({
    movies: [],
    loading: false,
    error: null,
    filters: defaultFilters()
  }),
  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        // this.filters is a Vue reactive Proxy - Electron's IPC structured-clone
        // can't serialize that across the context bridge, so send a plain snapshot.
        this.movies = await window.api.movies.list(JSON.parse(JSON.stringify(this.filters)))
      } catch (error) {
        this.error = error.message ?? String(error)
      } finally {
        this.loading = false
      }
    },
    setSearch(value) {
      this.filters.search = value
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => this.fetch(), SEARCH_DEBOUNCE_MS)
    },
    setGenreIds(ids) {
      this.filters.genreIds = ids
      this.fetch()
    },
    setDecades(decades) {
      this.filters.decades = decades
      this.fetch()
    },
    setRatingBuckets(buckets) {
      this.filters.ratingBuckets = buckets
      this.fetch()
    },
    setCollectionIds(ids) {
      this.filters.collectionIds = ids
      this.fetch()
    },
    setWatched(watched) {
      this.filters.watched = watched
      this.fetch()
    },
    toggleSort(column) {
      if (this.filters.sortBy === column) {
        this.filters.sortDir = this.filters.sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        this.filters.sortBy = column
        this.filters.sortDir = 'asc'
      }
      this.fetch()
    },
    clearFilters() {
      this.filters = defaultFilters()
      this.fetch()
    }
  }
})
