<script setup>
import { computed } from 'vue'

const props = defineProps({
  movies: { type: Array, required: true },
  sortBy: { type: String, default: 'title' },
  sortDir: { type: String, default: 'asc' },
  selectedIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['sort', 'select', 'toggle-select', 'toggle-select-visible'])

// "Select all" applies to the rows currently on screen, not the whole
// library - the checkbox sits in a filtered grid, so anything else would be
// a surprise.
const allVisibleSelected = computed(
  () => props.movies.length > 0 && props.movies.every((m) => props.selectedIds.includes(m.id))
)

// "Rated" is the MPAA certificate (G/PG/R/...); "IMDb" is the 0-10 score.
// Both were previously called some form of "rating", which made the column
// header ambiguous once they sit side by side.
const columns = [
  { key: 'title', label: 'Title' },
  { key: 'year', label: 'Year' },
  { key: 'rated', label: 'Rated' },
  { key: 'genre_names', label: 'Genre', sortable: false },
  { key: 'imdb_rating', label: 'IMDb' },
  { key: 'runtime_minutes', label: 'Runtime' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'last_watched_at', label: 'Watched' }
]

function onHeaderClick(column) {
  if (column.sortable === false) return
  emit('sort', column.key)
}
</script>

<template>
  <table class="movie-table">
    <thead>
      <tr>
        <th class="movie-table__check">
          <input
            type="checkbox"
            :checked="allVisibleSelected"
            title="Select all shown"
            @change="emit('toggle-select-visible', !allVisibleSelected)"
          />
        </th>
        <th
          v-for="column in columns"
          :key="column.key"
          :class="{
            'movie-table__sortable': column.sortable !== false,
            'movie-table__active': sortBy === column.key
          }"
          @click="onHeaderClick(column)"
        >
          {{ column.label }}
          <span v-if="sortBy === column.key" class="movie-table__arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="movie in movies" :key="movie.id" :class="{ 'movie-table__row--selected': selectedIds.includes(movie.id) }">
        <td class="movie-table__check">
          <input
            type="checkbox"
            :checked="selectedIds.includes(movie.id)"
            @change="emit('toggle-select', movie.id)"
          />
        </td>
        <td class="movie-table__title" @click="emit('select', movie)">{{ movie.title }}</td>
        <td>{{ movie.year || '—' }}</td>
        <td>{{ movie.rated || '—' }}</td>
        <td>{{ movie.genre_names || '—' }}</td>
        <td>{{ movie.imdb_rating ?? '—' }}</td>
        <td>{{ movie.runtime_label || '—' }}</td>
        <td>{{ movie.resolution_label || '—' }}</td>
        <td>{{ movie.last_watched_at ? new Date(movie.last_watched_at).toLocaleDateString() : '—' }}</td>
      </tr>
      <tr v-if="!movies.length">
        <td :colspan="columns.length + 1" class="movie-table__empty">No movies found.</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.movie-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.movie-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #3a3d47;
  color: #a6a9b4;
  font-weight: 600;
  user-select: none;
}

.movie-table__sortable {
  cursor: pointer;
}

.movie-table__sortable:hover {
  color: #e7e9ee;
}

.movie-table__active {
  color: #bfc6ff;
}

.movie-table__arrow {
  font-size: 10px;
}

.movie-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #26282f;
}

.movie-table__check {
  width: 34px;
  text-align: center;
  cursor: default;
}

.movie-table__row--selected {
  background: #262b3a;
}

.movie-table__title {
  cursor: pointer;
  color: #e7e9ee;
}

.movie-table__title:hover {
  text-decoration: underline;
}

.movie-table__empty {
  text-align: center;
  color: #8a8d97;
  padding: 24px;
}
</style>
