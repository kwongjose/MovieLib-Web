<script setup>
import { ref, onMounted } from 'vue'
import { useCollectionsStore } from '../stores/collections'
import MovieTable from '../components/MovieTable.vue'
import MovieDetailDialog from '../components/MovieDetailDialog.vue'
import MovieFormDialog from '../components/MovieFormDialog.vue'

const collectionsStore = useCollectionsStore()
const newCollectionName = ref('')
const activeCollectionId = ref(null)
const activeMovies = ref([])

const selectedMovieId = ref(null)
const formMode = ref(null)
const formMovieId = ref(null)

onMounted(() => collectionsStore.fetch())

async function createCollection() {
  const name = newCollectionName.value.trim()
  if (!name) return
  await collectionsStore.create(name)
  newCollectionName.value = ''
}

async function openCollection(id) {
  activeCollectionId.value = id
  activeMovies.value = await window.api.collections.getMovies(id)
}

async function refreshActive() {
  if (activeCollectionId.value) activeMovies.value = await window.api.collections.getMovies(activeCollectionId.value)
}

async function deleteCollection(id) {
  if (!confirm('Delete this collection? Movies stay in your library.')) return
  await collectionsStore.remove(id)
  if (activeCollectionId.value === id) {
    activeCollectionId.value = null
    activeMovies.value = []
  }
}

function onSelectMovie(movie) {
  selectedMovieId.value = movie.id
}

function closeDetail() {
  selectedMovieId.value = null
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
  await refreshActive()
}

async function onMovieDeleted() {
  selectedMovieId.value = null
  await refreshActive()
}
</script>

<template>
  <div class="collections-view">
    <div class="collections-view__sidebar">
      <div class="collections-view__add">
        <input
          v-model="newCollectionName"
          type="text"
          placeholder="New collection name"
          @keyup.enter="createCollection"
        />
        <button @click="createCollection">Create</button>
      </div>
      <ul class="collections-view__list">
        <li
          v-for="collection in collectionsStore.collections"
          :key="collection.id"
          class="collections-view__item"
          :class="{ 'collections-view__item--active': activeCollectionId === collection.id }"
        >
          <span class="collections-view__item-name" @click="openCollection(collection.id)">{{ collection.name }}</span>
          <!-- The count is what makes the franchise clutter visible: a list full
               of (1)s is the cue to use Maintenance -> Collections. -->
          <span class="collections-view__item-count">{{ collection.movie_count }}</span>
          <button class="collections-view__item-remove" @click="deleteCollection(collection.id)">×</button>
        </li>
        <li v-if="!collectionsStore.collections.length" class="collections-view__empty">
          No collections yet - create one above.
        </li>
      </ul>
    </div>

    <div class="collections-view__content">
      <MovieTable v-if="activeCollectionId" :movies="activeMovies" @select="onSelectMovie" />
      <p v-else class="collections-view__hint">Select a collection to see its movies.</p>
    </div>

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
.collections-view {
  display: flex;
  gap: 24px;
  height: 100%;
}

.collections-view__sidebar {
  width: 220px;
  flex-shrink: 0;
}

.collections-view__add {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.collections-view__add input {
  flex: 1;
  min-width: 0;
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 12px;
}

.collections-view__add button {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  cursor: pointer;
}

.collections-view__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collections-view__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 6px;
  padding: 6px 8px;
}

.collections-view__item:hover {
  background: #24262d;
}

.collections-view__item--active {
  background: #2d2f37;
}

.collections-view__item-name {
  cursor: pointer;
  font-size: 13px;
  flex: 1;
}

.collections-view__item-count {
  font-size: 11px;
  color: #6c7280;
  padding: 0 6px;
}

.collections-view__item-remove {
  background: transparent;
  border: none;
  color: #a6a9b4;
  cursor: pointer;
  font-size: 14px;
}

.collections-view__item-remove:hover {
  color: #e08a8a;
}

.collections-view__empty {
  color: #8a8d97;
  font-size: 12px;
}

.collections-view__content {
  flex: 1;
  min-width: 0;
}

.collections-view__hint {
  color: #8a8d97;
  font-size: 13px;
}
</style>
