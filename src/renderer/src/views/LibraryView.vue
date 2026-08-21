<script setup>
import { onMounted, computed, ref } from 'vue'
import { useMoviesStore } from '../stores/movies'
import { useGenresStore } from '../stores/genres'
import { useFoldersStore } from '../stores/folders'
import { useSettingsStore } from '../stores/settings'
import { useScanStore } from '../stores/scan'
import MultiSelectDropdown from '../components/MultiSelectDropdown.vue'
import MovieTable from '../components/MovieTable.vue'
import MovieDetailDialog from '../components/MovieDetailDialog.vue'
import MovieFormDialog from '../components/MovieFormDialog.vue'

const moviesStore = useMoviesStore()
const genresStore = useGenresStore()
const foldersStore = useFoldersStore()
const settingsStore = useSettingsStore()
const scanStore = useScanStore()

onMounted(async () => {
  await genresStore.fetch()
  await foldersStore.fetch()
  await settingsStore.fetch()
  await moviesStore.fetch()
})

const scanDisabledReason = computed(() => {
  if (!settingsStore.omdbApiKey) return 'Set an OMDb API key in Settings first.'
  if (!foldersStore.folders.length) return 'Add a library folder in Settings first.'
  return ''
})

async function onScanClick() {
  await scanStore.start()
  await moviesStore.fetch()
}

const genreOptions = computed(() => genresStore.genres.map((g) => ({ value: g.id, label: g.name })))

const currentDecadeStart = Math.floor(new Date().getFullYear() / 10) * 10
const decadeOptions = []
for (let decade = 1920; decade <= currentDecadeStart; decade += 10) {
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
</script>

<template>
  <div class="library-view">
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
        label="Rating"
        :options="ratingOptions"
        :model-value="moviesStore.filters.ratingBuckets"
        @update:model-value="moviesStore.setRatingBuckets"
      />
      <button class="library-view__clear" @click="moviesStore.clearFilters">Show All</button>
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

    <p v-if="moviesStore.loading" class="library-view__status">Loading…</p>
    <p v-else-if="moviesStore.error" class="library-view__status library-view__status--error">
      {{ moviesStore.error }}
    </p>
    <MovieTable
      v-else
      :movies="moviesStore.movies"
      :sort-by="moviesStore.filters.sortBy"
      :sort-dir="moviesStore.filters.sortDir"
      @sort="moviesStore.toggleSort"
      @select="onSelectMovie"
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
  </div>
</template>

<style scoped>
.library-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.library-view__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
