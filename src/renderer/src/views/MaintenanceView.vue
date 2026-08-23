<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useCollectionsStore } from '../stores/collections'
import { useMoviesStore } from '../stores/movies'
import MovieFormDialog from '../components/MovieFormDialog.vue'

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
const loading = ref(null) // 'duplicates' | 'notImported' | 'cleanup' | 'ratings' | 'collections' | 'suspect' | null

const missingRatings = ref(null)
const ratingProgress = ref(null)
const ratingResult = ref(null)
const ratingError = ref('')
let unsubscribeRatings = null

// Filename-vs-metadata audit. Runs offline over rows already in the database, so
// there is no progress channel to subscribe to - it returns in one go.
const suspectThreshold = ref(25)
const suspects = ref(null)
const rematchIds = ref({})
const rematchBusy = ref(null)
const rematchError = ref('')
const editingId = ref(null)

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

async function findSuspectMatches() {
  loading.value = 'suspect'
  rematchError.value = ''
  try {
    suspects.value = await window.api.movies.auditMatches({
      minScore: Number(suspectThreshold.value)
    })
    // A filename carrying an IMDb id already names the film that was meant, so
    // the re-match box starts filled in and the row needs one click, not a
    // lookup somewhere else.
    rematchIds.value = Object.fromEntries(
      suspects.value.flagged.map((row) => [row.id, row.imdbIdFromFilename || ''])
    )
  } finally {
    loading.value = null
  }
}

// Refetching with the row's *stored* imdb_id would just download the same wrong
// film again, so the correct id has to come from the user (or from the filename).
async function rematch(row) {
  const imdbId = (rematchIds.value[row.id] || '').trim()
  if (!imdbId) return
  rematchBusy.value = row.id
  rematchError.value = ''
  try {
    await window.api.movies.refetchFromTmdb(row.id, imdbId)
    await moviesStore.fetch()
    await findSuspectMatches()
  } catch (error) {
    rematchError.value = `${row.title}: ${error.message}`
  } finally {
    rematchBusy.value = null
  }
}

async function onSuspectSaved() {
  editingId.value = null
  await moviesStore.fetch()
  await findSuspectMatches()
}

function showFile(path) {
  window.api.system.openContainingFolder(path)
}

function fileNameOf(path) {
  return path.split(/[\\/]/).pop()
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
  suspects.value = null
  resetDone.value = true
  setTimeout(() => (resetDone.value = false), 3000)
}
</script>

<template>
  <div class="maintenance-view">
    <section class="maintenance-view__section">
      <h2>Suspect Matches</h2>
      <p class="maintenance-view__hint">
        A scan picks the best-scoring TMDB result for each filename and never records how
        close the call was, so a wrong pick still arrives with a poster, a plot and a cast -
        nothing about the row looks broken afterwards. This re-reads each film's filename and
        reports the ones that no longer agree with the metadata stored against them. It runs
        entirely offline, and changes nothing until you act on a row.
      </p>
      <p class="maintenance-view__hint">
        It can only compare the two: a file that was misnamed before it was imported will
        agree with its own bad metadata and stay quiet. Alternate release titles and TV
        episodes filed as movies show up here too, and are usually fine as they are.
      </p>

      <div class="maintenance-view__inline">
        <label class="maintenance-view__threshold">
          Report anything scoring
          <input v-model.number="suspectThreshold" type="number" min="5" max="200" step="5" />
          or worse
        </label>
        <button :disabled="loading === 'suspect'" @click="findSuspectMatches">
          {{ loading === 'suspect' ? 'Checking…' : 'Check Metadata' }}
        </button>
      </div>

      <p v-if="rematchError" class="maintenance-view__error">{{ rematchError }}</p>

      <template v-if="suspects">
        <p class="maintenance-view__result">
          Checked {{ suspects.scanned }} film(s) - {{ suspects.flagged.length }} worth a look.
          <span v-if="suspects.unjudgeable">
            {{ suspects.unjudgeable }} skipped, because the filename says too little to judge by.
          </span>
        </p>

        <ul class="suspects">
          <li v-for="row in suspects.flagged" :key="row.id" class="suspect">
            <div class="suspect__head">
              <span class="suspect__pill" :class="'suspect__pill--' + row.severity">
                {{ row.severity }}
              </span>
              <strong>{{ row.title }}</strong>
              <span class="suspect__year">({{ row.year || 'no year' }})</span>
            </div>

            <code class="suspect__file">{{ fileNameOf(row.path) }}</code>

            <ul class="suspect__reasons">
              <li v-for="reason in row.reasons" :key="reason">{{ reason }}</li>
            </ul>

            <div class="suspect__actions">
              <input
                v-model="rematchIds[row.id]"
                class="suspect__imdb"
                placeholder="tt0111161"
                spellcheck="false"
              />
              <button
                :disabled="rematchBusy === row.id || !rematchIds[row.id]"
                @click="rematch(row)"
              >
                {{ rematchBusy === row.id ? 'Fetching…' : 'Re-match' }}
              </button>
              <button @click="editingId = row.id">Edit</button>
              <button @click="showFile(row.path)">Show File</button>
            </div>
          </li>
          <li v-if="!suspects.flagged.length" class="maintenance-view__empty">
            Nothing stands out - every filename agrees with the metadata stored against it.
          </li>
        </ul>
      </template>
    </section>

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

    <MovieFormDialog
      v-if="editingId"
      mode="edit"
      :movie-id="editingId"
      @close="editingId = null"
      @saved="onSuspectSaved"
    />
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

/* Suspect Matches. Taller rows than the other lists here, because each one has
   to show the filename and the metadata side by side to make its own case. */
.suspects {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  max-height: 420px;
  overflow-y: auto;
}

.suspect {
  border: 1px solid #2f323a;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.suspect__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #e7e9ee;
  flex-wrap: wrap;
}

.suspect__year {
  color: #8a8d97;
}

.suspect__pill {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 4px;
  padding: 2px 6px;
}

.suspect__pill--high {
  background: #4a2a2a;
  color: #e08a8a;
}

.suspect__pill--medium {
  background: #4a412a;
  color: #d9c07e;
}

.suspect__pill--low {
  background: #3a3d47;
  color: #a6a9b4;
}

.suspect__file {
  display: block;
  margin: 8px 0 0;
  font-size: 12px;
  color: #a6a9b4;
  word-break: break-all;
}

.suspect__reasons {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #c6c8d0;
}

.suspect__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.suspect__imdb {
  width: 104px;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 12px;
  font-family: inherit;
}
</style>
