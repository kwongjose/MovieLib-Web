<script setup>
import { onMounted, computed, ref } from 'vue'
import { useMoviesStore } from '../stores/movies'
import { useGenresStore } from '../stores/genres'
import { useFoldersStore } from '../stores/folders'
import { useScanStore } from '../stores/scan'
import { useCollectionsStore } from '../stores/collections'
import MultiSelectDropdown from '../components/MultiSelectDropdown.vue'
import MovieTable from '../components/MovieTable.vue'
import MovieDetailDialog from '../components/MovieDetailDialog.vue'
import MovieFormDialog from '../components/MovieFormDialog.vue'
import CompareDialog from '../components/CompareDialog.vue'
import BulkCollectionDialog from '../components/BulkCollectionDialog.vue'

const moviesStore = useMoviesStore()
const genresStore = useGenresStore()
const foldersStore = useFoldersStore()
const scanStore = useScanStore()
const collectionsStore = useCollectionsStore()

const tmdbKey = ref('')

onMounted(async () => {
  tmdbKey.value = (await window.api.settings.getTmdbKey()) ?? ''
  await genresStore.fetch()
  await foldersStore.fetch()
  await collectionsStore.fetch()
  await moviesStore.fetchRatedOptions()
  await moviesStore.fetch()
})

// OMDb is no longer required to scan: metadata comes from TMDB now, and a
// missing OMDb key only costs the IMDb rating. Gating on it would refuse a scan
// that would otherwise work fine.
const scanDisabledReason = computed(() => {
  if (!tmdbKey.value) return 'Add a TMDB API key in Settings first.'
  if (!foldersStore.folders.length) return 'Add a library folder in Settings first.'
  return ''
})

async function onScanClick() {
  await scanStore.start()
  await moviesStore.fetchRatedOptions()
  await moviesStore.fetch()
}

const genreOptions = computed(() => genresStore.genres.map((g) => ({ value: g.id, label: g.name })))
const collectionOptions = computed(() => collectionsStore.collections.map((c) => ({ value: c.id, label: c.name })))
const ratedOptions = computed(() => moviesStore.ratedOptions.map((r) => ({ value: r, label: r })))

// Newest decade first, so recent films are reachable without scrolling.
// Runs one decade past the current one rather than stopping at it, so the
// list still covers new releases as soon as the calendar rolls over.
const currentDecadeStart = Math.floor(new Date().getFullYear() / 10) * 10
const decadeOptions = []
for (let decade = currentDecadeStart + 10; decade >= 1920; decade -= 10) {
  decadeOptions.push({ value: `${decade}s`, label: `${decade}s` })
}

const ratingOptions = [
  { value: '9+', label: '9+' },
  { value: '8-9', label: '8–9' },
  { value: '7-8', label: '7–8' },
  { value: '6-7', label: '6–7' },
  { value: 'below-6', label: 'Below 6' }
]

function onSearchInput(event) {
  moviesStore.setSearch(event.target.value)
}

const selectedMovieId = ref(null)
const formMode = ref(null) // null | 'add' | 'edit'
const formMovieId = ref(null)

function onSelectMovie(movie) {
  selectedMovieId.value = movie.id
}

function closeDetail() {
  selectedMovieId.value = null
}

function openAddForm() {
  formMode.value = 'add'
  formMovieId.value = null
}

function openEditForm(id) {
  formMode.value = 'edit'
  formMovieId.value = id
  selectedMovieId.value = null
}

function closeForm() {
  formMode.value = null
  formMovieId.value = null
}

async function onFormSaved() {
  closeForm()
  await moviesStore.fetch()
}

async function onMovieDeleted() {
  selectedMovieId.value = null
  await moviesStore.fetch()
}

const comparing = ref(false)
const bulkCollections = ref(false)

// The Collection filter may be active, in which case the grid still shows films
// that were just removed from the collection it is filtered to. Same staleness
// MaintenanceView guards against after a bulk collection delete.
async function onBulkCollectionsChanged() {
  await moviesStore.fetch()
}

function removeFromComparison(id) {
  moviesStore.toggleSelected(id)
  if (moviesStore.selectedIds.length === 0) comparing.value = false
}

async function onComparedWatched() {
  // Reflect the new watched date in the grid behind the dialog.
  await moviesStore.fetch()
}
</script>

<template>
  <div class="library-view">
    <!-- Sticky, so the filters and actions stay reachable while scrolling
         the table. The status lines below stay outside on purpose: they
         describe the table and should scroll away with it. -->
    <div class="library-view__header">
    <div class="library-view__toolbar">
      <input
        type="text"
        placeholder="Search title or actor..."
        class="library-view__search"
        @input="onSearchInput"
      />
      <MultiSelectDropdown
        label="Genre"
        :options="genreOptions"
        :model-value="moviesStore.filters.genreIds"
        @update:model-value="moviesStore.setGenreIds"
      />
      <MultiSelectDropdown
        label="Decade"
        :options="decadeOptions"
        :model-value="moviesStore.filters.decades"
        @update:model-value="moviesStore.setDecades"
      />
      <MultiSelectDropdown
        label="Rated"
        :options="ratedOptions"
        :model-value="moviesStore.filters.ratedValues"
        @update:model-value="moviesStore.setRatedValues"
      />
      <MultiSelectDropdown
        label="IMDb"
        :options="ratingOptions"
        :model-value="moviesStore.filters.ratingBuckets"
        @update:model-value="moviesStore.setRatingBuckets"
      />
      <MultiSelectDropdown
        label="Collection"
        :options="collectionOptions"
        :model-value="moviesStore.filters.collectionIds"
        @update:model-value="moviesStore.setCollectionIds"
      />
      <!-- Narrows to whatever arrived in the most recent scan, so a fresh
           import can be checked over before it disappears into the library. -->
      <button
        class="library-view__clear"
        :class="{ 'library-view__clear--active': moviesStore.filters.latestImportOnly }"
        title="Show only the movies from the most recent import"
        @click="moviesStore.toggleLatestImport"
      >
        Latest Import
      </button>
      <button class="library-view__clear" @click="moviesStore.clearFilters">Show All</button>
    </div>

    <!-- Actions on their own row: the filter row grew past one line as
         dropdowns were added, and letting it wrap put related buttons in
         unrelated places. -->
    <div class="library-view__actions">
      <button
        class="library-view__compare"
        :disabled="moviesStore.selectedIds.length < 2"
        :title="moviesStore.selectedIds.length < 2 ? 'Tick at least two movies to compare' : ''"
        @click="comparing = true"
      >
        Compare<span v-if="moviesStore.selectedIds.length"> ({{ moviesStore.selectedIds.length }})</span>
      </button>
      <button
        v-if="moviesStore.selectedIds.length"
        class="library-view__clear"
        @click="moviesStore.clearSelection"
      >
        Clear Selection
      </button>
      <button
        class="library-view__compare"
        :disabled="!moviesStore.selectedIds.length"
        :title="!moviesStore.selectedIds.length ? 'Tick the movies you want to file' : ''"
        @click="bulkCollections = true"
      >
        Add to Collection<span v-if="moviesStore.selectedIds.length"> ({{ moviesStore.selectedIds.length }})</span>
      </button>
      <button class="library-view__add" @click="openAddForm">+ Add Movie</button>
      <button
        class="library-view__scan"
        :disabled="scanStore.scanning || !!scanDisabledReason"
        :title="scanDisabledReason"
        @click="onScanClick"
      >
        {{ scanStore.scanning ? 'Scanning…' : 'Scan for New Movies' }}
      </button>
    </div>
    </div>

    <!-- Its own v-if, deliberately not part of the chain below - an else-if
         here would hide the table it is describing. -->
    <p v-if="moviesStore.filters.latestImportOnly" class="library-view__status">
      Showing {{ moviesStore.movies.length }} movie(s) from the latest import, oldest first -
      the newest additions are at the bottom.
    </p>

    <p v-if="moviesStore.loading" class="library-view__status">Loading…</p>
    <p v-else-if="moviesStore.error" class="library-view__status library-view__status--error">
      {{ moviesStore.error }}
    </p>
    <MovieTable
      v-else
      :movies="moviesStore.movies"
      :sort-by="moviesStore.filters.sortBy"
      :sort-dir="moviesStore.filters.sortDir"
      :selected-ids="moviesStore.selectedIds"
      @sort="moviesStore.toggleSort"
      @select="onSelectMovie"
      @toggle-select="moviesStore.toggleSelected"
      @toggle-select-visible="moviesStore.setVisibleSelected"
    />

    <MovieDetailDialog
      v-if="selectedMovieId"
      :movie-id="selectedMovieId"
      @close="closeDetail"
      @edit="openEditForm"
      @deleted="onMovieDeleted"
    />
    <MovieFormDialog
      v-if="formMode"
      :mode="formMode"
      :movie-id="formMovieId"
      @close="closeForm"
      @saved="onFormSaved"
    />
    <BulkCollectionDialog
      v-if="bulkCollections"
      :movie-ids="moviesStore.selectedIds"
      @close="bulkCollections = false"
      @changed="onBulkCollectionsChanged"
    />
    <CompareDialog
      v-if="comparing"
      :key="moviesStore.selectedIds.join(',')"
      :movie-ids="moviesStore.selectedIds"
      @close="comparing = false"
      @remove="removeFromComparison"
      @watched="onComparedWatched"
    />
  </div>
</template>

<style scoped>
.library-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.library-view__header {
  position: sticky;
  /* Sticky offsets track the margin box, so the -24px pull-up below has to
     be mirrored here or rows peek out in a 24px band under the nav. */
  top: -24px;
  z-index: 15; /* above table rows; below .app-nav (20) */
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #1b1d22;
  /* Stretch the background across .app-content's 24px gutters so rows
     can't peek out beside or above the bar while scrolling. */
  padding: 24px 24px 12px;
  margin: -24px -24px 0;
  border-bottom: 1px solid #26282f;
}

.library-view__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.library-view__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: -4px;
}

.library-view__search {
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  min-width: 220px;
  flex: 1;
}

.library-view__clear {
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
}

.library-view__clear:hover {
  color: #e7e9ee;
  background: #2d2f37;
}

/* Same "this filter is on" treatment the multi-select dropdowns use. */
.library-view__clear--active {
  border-color: #6c7bff;
  color: #bfc6ff;
}

.library-view__compare {
  background: #3a3d47;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.library-view__compare:hover:not(:disabled) {
  background: #454854;
}

.library-view__compare:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.library-view__add {
  margin-left: auto;
  background: #3a3d47;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.library-view__add:hover {
  background: #454854;
}

.library-view__scan {
  background: #3a3d47;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.library-view__scan:hover:not(:disabled) {
  background: #454854;
}

.library-view__scan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.library-view__status {
  color: #8a8d97;
  font-size: 13px;
}

.library-view__status--error {
  color: #e08a8a;
}
</style>
