<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  movieIds: { type: Array, required: true }
})

const emit = defineEmits(['close', 'remove', 'watched'])

const movies = ref([])
const loading = ref(true)

// Fetched by id rather than reused from the grid: a film can be ticked and
// then filtered out of view, and it should still appear in the comparison.
onMounted(async () => {
  movies.value = await Promise.all(props.movieIds.map((id) => window.api.movies.getById(id)))
  loading.value = false
})

// The stored plot is OMDb's full synopsis, which is far too long to scan
// across several columns at once.
function shortPlot(plot) {
  if (!plot) return 'No description available.'
  const limit = 260
  if (plot.length <= limit) return plot
  const cut = plot.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : limit)}…`
}

async function watchMovie(movie) {
  await window.api.system.openFile(movie.path)
  await window.api.movies.markWatched(movie.id, {})
  emit('watched', movie.id)
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="compare">
      <div class="compare__header">
        <h2 class="compare__title">Compare {{ movieIds.length }} movies</h2>
        <button class="compare__close" @click="emit('close')">×</button>
      </div>

      <p v-if="loading" class="compare__loading">Loading…</p>

      <div v-else class="compare__grid">
        <article v-for="movie in movies" :key="movie.id" class="card">
          <button class="card__remove" title="Remove from comparison" @click="emit('remove', movie.id)">×</button>

          <h3 class="card__title">{{ movie.title }}</h3>
          <p class="card__sub">{{ movie.year || '—' }}<span v-if="movie.rated"> · {{ movie.rated }}</span></p>

          <dl class="card__facts">
            <div class="card__fact">
              <dt>IMDb</dt>
              <dd class="card__score">{{ movie.imdb_rating != null ? `${movie.imdb_rating}/10` : '—' }}</dd>
            </div>
            <div class="card__fact">
              <dt>Runtime</dt>
              <dd>{{ movie.runtime_label || '—' }}</dd>
            </div>
          </dl>

          <p class="card__plot">{{ shortPlot(movie.plot) }}</p>

          <p v-if="movie.last_watched_at" class="card__watched">
            Watched {{ new Date(movie.last_watched_at).toLocaleDateString() }}
          </p>

          <button class="card__watch" @click="watchMovie(movie)">Watch This One</button>
        </article>
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

.compare {
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 20px 24px 24px;
  width: min(1180px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.compare__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.compare__title {
  margin: 0;
  font-size: 17px;
}

.compare__close {
  background: transparent;
  border: none;
  color: #a6a9b4;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.compare__close:hover {
  color: #e7e9ee;
}

.compare__loading {
  color: #8a8d97;
  font-size: 13px;
}

/* Fixed-width columns that scroll sideways rather than squeezing: the
   point of the view is comparing like against like, which breaks down if
   the cards reflow to different heights and widths as you add more. */
.compare__grid {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.card {
  position: relative;
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  background: #1e2027;
  border: 1px solid #33353d;
  border-radius: 8px;
  padding: 14px;
}

.card__remove {
  position: absolute;
  top: 6px;
  right: 8px;
  background: transparent;
  border: none;
  color: #6c7280;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.card__remove:hover {
  color: #e08a8a;
}

.card__title {
  margin: 0 18px 2px 0;
  font-size: 15px;
  line-height: 1.3;
}

.card__sub {
  margin: 0 0 12px;
  font-size: 12px;
  color: #8a8d97;
}

.card__facts {
  display: flex;
  gap: 18px;
  margin: 0 0 12px;
}

.card__fact dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a8d97;
  margin-bottom: 2px;
}

.card__fact dd {
  margin: 0;
  font-size: 14px;
}

.card__score {
  color: #e0c48a;
  font-weight: 600;
}

.card__plot {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #c6c8d0;
  flex: 1;
}

.card__watched {
  margin: 0 0 10px;
  font-size: 11px;
  color: #7ed492;
}

.card__watch {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
}

.card__watch:hover {
  background: #454854;
}
</style>
