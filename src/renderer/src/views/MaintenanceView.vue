<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useCollectionsStore } from '../stores/collections'
import { useMoviesStore } from '../stores/movies'

const collectionsStore = useCollectionsStore()
const moviesStore = useMoviesStore()

// A TMDB scan links every film's franchise, so the collection list fills up with
// one- and two-film entries that bury the ones worth keeping. Both actions below
// delete collections only - every movie stays in the library.
const minMovies = ref(3)
const smallCount = ref(null)
const collectionResult = ref(null)

const duplicates = ref(null)
const notImported = ref(null)
const cleanupResult = ref(null)
const resetDone = ref(false)
const loading = ref(null) // 'duplicates' | 'notImported' | 'cleanup' | 'ratings' | 'collections' | null

const missingRatings = ref(null)
const ratingProgress = ref(null)
const ratingResult = ref(null)
const ratingError = ref('')
let unsubscribeRatings = null

onMounted(async () => {
  missingRatings.value = await window.api.movies.countMissingRatings()
  unsubscribeRatings = window.api.movies.onBackfillProgress((p) => (ratingProgress.value = p))
  await collectionsStore.fetch()
  await refreshSmallCount()
})

onUnmounted(() => unsubscribeRatings?.())

async function refreshSmallCount() {
  const threshold = Number(minMovies.value)
  smallCount.value = Number.isFinite(threshold) && threshold > 0
    ? await window.api.collections.countSmall(threshold)
    : null
}

watch(minMovies, refreshSmallCount)

// The collection ids in the Library filter can point at rows that no longer
// exist after a bulk delete, which would silently return an empty grid - so the
// filter is reset alongside the delete rather than left dangling.
async function afterCollectionDelete(deletedCount) {
  collectionResult.value = `Deleted ${deletedCount} collection(s). All movies kept.`
  await refreshSmallCount()
  if (moviesStore.filters.collectionIds.length) moviesStore.setCollectionIds([])
}

async function deleteSmallCollections() {
  const threshold = Number(minMovies.value)
  if (!smallCount.value) return
  if (!confirm(`Delete ${smallCount.value} collection(s) with fewer than ${threshold} movies? The movies themselves are kept.`))
    return
  loading.value = 'collections'
  try {
    const { deletedCount } = await collectionsStore.deleteSmall(threshold)
    await afterCollectionDelete(deletedCount)
  } finally {
    loading.value = null
  }
}

async function clearAllCollections() {
  if (!confirm('Delete EVERY collection? Your movies are kept - only the groupings are removed.')) return
  if (!confirm('Are you absolutely sure? All collections, including ones you made by hand, will be gone.')) return
  loading.value = 'collections'
  try {
    const { deletedCount } = await collectionsStore.clearAll()
    await afterCollectionDelete(deletedCount)
  } finally {
    loading.value = null
  }
}

async function fetchMissingRatings() {
  loading.value = 'ratings'
  ratingResult.value = null
  ratingError.value = ''
  ratingProgress.value = null
  try {
    ratingResult.value = await window.api.movies.backfillRatings()
  } catch (error) {
    ratingError.value = error.message
  } finally {
    missingRatings.value = await window.api.movies.countMissingRatings()
    ratingProgress.value = null
    loading.value = null
  }
}

async function findDuplicates() {
  loading.value = 'duplicates'
  duplicates.value = await window.api.movies.findDuplicates()
  loading.value = null
}

async function findNotImported() {
  loading.value = 'notImported'
  notImported.value = await window.api.scan.findNotImported()
  loading.value = null
}

async function cleanupMissingFiles() {
  loading.value = 'cleanup'
  cleanupResult.value = await window.api.movies.cleanupMissingFiles()
  loading.value = null
}

async function resetLibrary() {
  if (!confirm('This deletes ALL movies and actors. Genres, collections, and saved folders are kept. This cannot be undone.')) return
  if (!confirm('Are you absolutely sure? Your entire movie library will be wiped.')) return
  await window.api.movies.resetLibrary()
  // Every collection is empty now, so the counts shown above are stale.
  await collectionsStore.fetch()
  await refreshSmallCount()
  duplicates.value = null
  notImported.value = null
  cleanupResult.value = null
  resetDone.value = true
  setTimeout(() => (resetDone.value = false), 3000)
}
</script>

<template>
  <div class="maintenance-view">
    <section class="maintenance-view__section">
      <h2>Duplicates</h2>
      <p class="maintenance-view__hint">Movies that share the same title and year.</p>
      <button :disabled="loading === 'duplicates'" @click="findDuplicates">
        {{ loading === 'duplicates' ? 'Searching…' : 'Find Duplicates' }}
      </button>
      <ul v-if="duplicates" class="maintenance-view__list">
        <li v-for="dup in duplicates" :key="`${dup.title}-${dup.year}`">
          {{ dup.title }} ({{ dup.year || 'unknown year' }}) - {{ dup.count }} copies
        </li>
        <li v-if="!duplicates.length" class="maintenance-view__empty">No duplicates found.</li>
      </ul>
    </section>

    <section class="maintenance-view__section">
      <h2>Not Yet Imported</h2>
      <p class="maintenance-view__hint">Video files in your saved folders that aren't in the library yet.</p>
      <button :disabled="loading === 'notImported'" @click="findNotImported">
        {{ loading === 'notImported' ? 'Searching…' : 'Find Not Yet Imported' }}
      </button>
      <ul v-if="notImported" class="maintenance-view__list">
        <li v-for="file in notImported" :key="file">{{ file }}</li>
        <li v-if="!notImported.length" class="maintenance-view__empty">
          Nothing found - everything in your folders is already imported.
        </li>
      </ul>
    </section>

    <section class="maintenance-view__section">
      <h2>IMDb Ratings</h2>
      <p class="maintenance-view__hint">
        TMDB carries no IMDb rating, so it comes from OMDb - and a scan run while your OMDb
        key was spent imports films with that column empty. Free keys allow 1000 lookups a
        day, so a large library will not finish in one go. Re-scanning won't fix it, since a
        scan only looks at files it hasn't imported before. Run this to fill in the gaps -
        one lookup per film, and it picks up where it left off.
      </p>

      <p v-if="missingRatings !== null" class="maintenance-view__result">
        {{ missingRatings === 0
          ? 'Every film has an IMDb rating.'
          : `${missingRatings} film(s) have no IMDb rating.` }}
      </p>

      <button
        :disabled="loading === 'ratings' || missingRatings === 0"
        @click="fetchMissingRatings"
      >
        {{ loading === 'ratings' ? 'Fetching…' : 'Fetch Missing Ratings' }}
      </button>

      <p v-if="ratingProgress" class="maintenance-view__result">
        {{ ratingProgress.current }} / {{ ratingProgress.total }} - {{ ratingProgress.currentTitle }}
      </p>

      <p v-if="ratingError" class="maintenance-view__error">{{ ratingError }}</p>

      <p v-else-if="ratingResult" class="maintenance-view__result">
        Filled {{ ratingResult.filled }} of {{ ratingResult.total }}.
        <span v-if="ratingResult.unavailable">
          {{ ratingResult.unavailable }} have no rating on OMDb.
        </span>
        <span v-if="ratingResult.stoppedEarly">
          Stopped with {{ ratingResult.remaining }} left - no usable OMDb key remaining.
          Free keys reset daily, so run this again tomorrow or add another key in Settings.
        </span>
      </p>
    </section>

    <section class="maintenance-view__section">
      <h2>Clean Up Missing Files</h2>
      <p class="maintenance-view__hint">
        Checks every movie's file path on disk and removes rows whose file no longer exists.
      </p>
      <button :disabled="loading === 'cleanup'" @click="cleanupMissingFiles">
        {{ loading === 'cleanup' ? 'Checking…' : 'Clean Up Missing Files' }}
      </button>
      <p v-if="cleanupResult" class="maintenance-view__result">
        Removed {{ cleanupResult.removedCount }} row(s) whose file no longer exists.
      </p>
    </section>

    <section class="maintenance-view__section">
      <h2>Collections</h2>
      <p class="maintenance-view__hint">
        Every imported film links its TMDB franchise, so most collections end up holding one
        or two movies and crowd out the ones worth having. Both actions here delete
        collections only - no movie is ever removed from the library.
      </p>

      <p class="maintenance-view__result">
        {{ collectionsStore.collections.length }} collection(s) in total.
      </p>

      <div class="maintenance-view__inline">
        <label class="maintenance-view__threshold">
          Fewer than
          <input v-model.number="minMovies" type="number" min="1" max="99" />
          movies
        </label>
        <button :disabled="loading === 'collections' || !smallCount" @click="deleteSmallCollections">
          {{ smallCount ? `Delete ${smallCount} Collection(s)` : 'Nothing to Delete' }}
        </button>
      </div>

      <p v-if="collectionResult" class="maintenance-view__result">{{ collectionResult }}</p>

      <p class="maintenance-view__hint maintenance-view__hint--spaced">
        Or start the groupings over from nothing:
      </p>
      <button
        class="maintenance-view__reset"
        :disabled="loading === 'collections' || !collectionsStore.collections.length"
        @click="clearAllCollections"
      >
        Clear All Collections
      </button>
    </section>

    <section class="maintenance-view__section maintenance-view__section--danger">
      <h2>Reset Library</h2>
      <p class="maintenance-view__hint">
        Wipes all movies and actors. Genres, collections, and saved folders are preserved. This
        cannot be undone.
      </p>
      <button class="maintenance-view__reset" @click="resetLibrary">Reset Library</button>
      <p v-if="resetDone" class="maintenance-view__result">Library reset.</p>
    </section>
  </div>
</template>

<style scoped>
.maintenance-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 640px;
}

.maintenance-view__section h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.maintenance-view__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #8a8d97;
}

.maintenance-view__section button {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.maintenance-view__section button:hover:not(:disabled) {
  background: #454854;
}

.maintenance-view__section button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.maintenance-view__hint--spaced {
  margin-top: 18px;
}

.maintenance-view__inline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.maintenance-view__threshold {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #a6a9b4;
}

.maintenance-view__threshold input {
  width: 56px;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 13px;
  font-family: inherit;
}

.maintenance-view__list {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: #c6c8d0;
  max-height: 200px;
  overflow-y: auto;
}

.maintenance-view__empty {
  color: #8a8d97;
  list-style: none;
  margin-left: -18px;
}

.maintenance-view__result {
  margin: 10px 0 0;
  font-size: 13px;
  color: #7ed492;
}

.maintenance-view__error {
  margin: 10px 0 0;
  font-size: 13px;
  color: #e08a8a;
}

.maintenance-view__section--danger {
  border-top: 1px dashed #3a3d47;
  padding-top: 20px;
}

.maintenance-view__reset {
  background: transparent !important;
  border: 1px solid #4a3a3a;
  color: #e08a8a !important;
}

.maintenance-view__reset:hover {
  background: #3a2a2a !important;
}
</style>
