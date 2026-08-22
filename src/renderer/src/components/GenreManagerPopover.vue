<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useGenresStore } from '../stores/genres'

const genresStore = useGenresStore()
const open = ref(false)
const newGenreName = ref('')
const root = ref(null)

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  // Loads its own genres: this now lives in the app nav, so it is mounted on
  // every view, including ones that never fetch the genre list themselves.
  if (!genresStore.genres.length) genresStore.fetch()
})
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

async function addGenre() {
  const name = newGenreName.value.trim()
  if (!name) return
  await genresStore.add(name)
  newGenreName.value = ''
}

async function removeGenre(name) {
  if (!confirm(`Remove genre "${name}"? Movies keep their other genres.`)) return
  await genresStore.remove(name)
}
</script>

<template>
  <div ref="root" class="genre-manager">
    <button type="button" class="genre-manager__trigger" @click="open = !open">Manage Genres</button>
    <div v-if="open" class="genre-manager__panel">
      <div class="genre-manager__list">
        <span v-for="genre in genresStore.genres" :key="genre.id" class="genre-manager__chip">
          {{ genre.name }}
          <button type="button" class="genre-manager__remove" @click="removeGenre(genre.name)">×</button>
        </span>
      </div>
      <div class="genre-manager__add">
        <input
          v-model="newGenreName"
          type="text"
          placeholder="New genre"
          class="genre-manager__input"
          @keyup.enter="addGenre"
        />
        <button type="button" class="genre-manager__add-btn" @click="addGenre">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.genre-manager {
  position: relative;
  display: inline-block;
}

.genre-manager__trigger {
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
}

.genre-manager__trigger:hover {
  color: #e7e9ee;
  background: #2d2f37;
}

.genre-manager__panel {
  position: absolute;
  top: calc(100% + 4px);
  /* Anchored to the right: the trigger sits at the right end of the nav, so
     a left-anchored panel runs off the window and forces a horizontal
     scrollbar. */
  right: 0;
  z-index: 10;
  width: 280px;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.genre-manager__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.genre-manager__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #2d2f37;
  border: 1px solid #3a3d47;
  border-radius: 14px;
  padding: 3px 6px 3px 10px;
  font-size: 12px;
}

.genre-manager__remove {
  background: transparent;
  border: none;
  color: #a6a9b4;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.genre-manager__remove:hover {
  color: #e08a8a;
}

.genre-manager__add {
  display: flex;
  gap: 6px;
}

.genre-manager__input {
  flex: 1;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}

.genre-manager__add-btn {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.genre-manager__add-btn:hover {
  background: #454854;
}
</style>
