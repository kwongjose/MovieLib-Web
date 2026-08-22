<script setup>
import { ref, onMounted, computed } from 'vue'
import CollectionPicker from './CollectionPicker.vue'

const props = defineProps({
  movieId: { type: Number, required: true }
})

const emit = defineEmits(['close', 'edit', 'deleted'])

const movie = ref(null)
const loading = ref(true)

async function load() {
  loading.value = true
  movie.value = await window.api.movies.getById(props.movieId)
  loading.value = false
}

onMounted(load)

// Full cast shown - the original hard-capped this at 4 actors, no reason to keep that.
const actorNames = computed(() => (movie.value?.actors?.length ? movie.value.actors.map((a) => a.name).join(', ') : '—'))
const genreNames = computed(() => (movie.value?.genres?.length ? movie.value.genres.map((g) => g.name).join(', ') : '—'))

async function watchMovie() {
  await window.api.system.openFile(movie.value.path)
}

async function showInFolder() {
  await window.api.system.openContainingFolder(movie.value.path)
}

async function markWatched() {
  movie.value = await window.api.movies.markWatched(movie.value.id, {})
}

async function clearWatched() {
  movie.value = await window.api.movies.clearWatched(movie.value.id)
}

async function deleteMovie() {
  if (!confirm(`Delete "${movie.value.title}" from the library?`)) return
  const deleteFile = confirm('Also delete the file from disk?')
  await window.api.movies.delete(movie.value.id, { deleteFile })
  emit('deleted')
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div v-if="!loading && movie" class="dialog-box">
      <button class="dialog-box__close" @click="emit('close')">×</button>

      <div class="detail">
        <img v-if="movie.poster_url" :src="movie.poster_url" class="detail__poster" alt="" />
        <div v-else class="detail__poster detail__poster--placeholder">No Poster</div>

        <div class="detail__info">
          <h2 class="detail__title">{{ movie.title }}</h2>
          <p class="detail__meta">
            <span class="detail__rated" :class="{ 'detail__rated--unknown': !movie.rated }">
              {{ movie.rated || 'Not Rated' }}
            </span>
            {{ movie.year || '—' }} · IMDb
            {{ movie.imdb_rating != null ? `${movie.imdb_rating}/10` : '—' }}
          </p>
          <p class="detail__meta">{{ genreNames }}</p>
          <p class="detail__meta">{{ movie.runtime_label || '—' }} · {{ movie.resolution_label || '—' }}</p>
          <p class="detail__meta detail__meta--watched">
            {{ movie.last_watched_at ? `Watched ${new Date(movie.last_watched_at).toLocaleDateString()}` : 'Not watched yet' }}
          </p>
          <p class="detail__actors"><strong>Starring:</strong> {{ actorNames }}</p>
          <p class="detail__plot">{{ movie.plot || 'No plot available.' }}</p>

          <div class="detail__collections">
            <strong>Collections:</strong>
            <CollectionPicker :movie-id="movie.id" :selected-collections="movie.collections" @changed="load" />
          </div>

          <div class="detail__actions">
            <button @click="watchMovie">Watch Movie</button>
            <button @click="showInFolder">Show in Folder</button>
            <button v-if="!movie.last_watched_at" @click="markWatched">Mark as Watched</button>
            <button v-else @click="clearWatched">Clear Watched</button>
            <button @click="emit('edit', movie.id)">Edit</button>
            <button class="detail__delete" @click="deleteMovie">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 11, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog-box {
  position: relative;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 24px;
  width: min(720px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
}

.dialog-box__close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: #a6a9b4;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.dialog-box__close:hover {
  color: #e7e9ee;
}

.detail {
  display: flex;
  gap: 20px;
}

.detail__poster {
  width: 180px;
  height: 266px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: #2d2f37;
}

.detail__poster--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c7280;
  font-size: 12px;
}

.detail__info {
  flex: 1;
  min-width: 0;
}

.detail__title {
  margin: 0 0 6px;
  font-size: 22px;
}

.detail__meta {
  margin: 0 0 6px;
  color: #a6a9b4;
  font-size: 13px;
}

.detail__meta--watched {
  color: #7ed492;
}

/* MPAA certificate, boxed so it reads as a classification rather than
   another number next to the IMDb score. */
.detail__rated {
  display: inline-block;
  border: 1px solid #6c7280;
  border-radius: 3px;
  padding: 1px 6px;
  margin-right: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #e7e9ee;
  vertical-align: 1px;
}

.detail__rated--unknown {
  border-color: #44464f;
  color: #8a8d97;
  font-weight: 400;
}

.detail__actors {
  margin: 10px 0 6px;
  font-size: 13px;
}

.detail__plot {
  margin: 0 0 16px;
  font-size: 13px;
  color: #c6c8d0;
  line-height: 1.5;
}

.detail__collections {
  margin: 0 0 14px;
  font-size: 13px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail__actions button {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.detail__actions button:hover {
  background: #454854;
}

.detail__delete {
  background: transparent !important;
  border: 1px solid #4a3a3a !important;
  color: #e08a8a !important;
  margin-left: auto;
}

.detail__delete:hover {
  background: #3a2a2a !important;
}
</style>
