<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useGenresStore } from '../stores/genres'
import MultiSelectDropdown from './MultiSelectDropdown.vue'
import ActorChipList from './ActorChipList.vue'

const props = defineProps({
  mode: { type: String, required: true }, // 'add' | 'edit'
  movieId: { type: Number, default: null }
})

const emit = defineEmits(['close', 'saved'])

const genresStore = useGenresStore()
const genreOptions = computed(() => genresStore.genres.map((g) => ({ value: g.id, label: g.name })))

const isEdit = computed(() => props.mode === 'edit')

const useImdbId = ref(false)
const imdbIdInput = ref('')
const pathInput = ref('')
const genreIds = ref([])
const actors = ref([]) // [{ id?, name }]
const saving = ref(false)
const loading = ref(isEdit.value)
const error = ref(null)

const fields = reactive({
  title: '',
  year: '',
  rated: '',
  imdb_rating: '',
  runtime_label: '',
  resolution_label: '',
  plot: ''
})

onMounted(async () => {
  await genresStore.fetch()

  if (isEdit.value) {
    const movie = await window.api.movies.getById(props.movieId)
    fields.title = movie.title ?? ''
    fields.year = movie.year ?? ''
    fields.rated = movie.rated ?? ''
    fields.imdb_rating = movie.imdb_rating ?? ''
    fields.runtime_label = movie.runtime_label ?? ''
    fields.resolution_label = movie.resolution_label ?? ''
    fields.plot = movie.plot ?? ''
    pathInput.value = movie.path
    genreIds.value = movie.genres.map((g) => g.id)
    actors.value = [...movie.actors]
    loading.value = false
  }
})

function genreNamesFromIds(ids) {
  const byId = new Map(genresStore.genres.map((g) => [g.id, g.name]))
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

async function addActor(name) {
  if (isEdit.value) {
    await window.api.movies.addActor(props.movieId, name)
    const movie = await window.api.movies.getById(props.movieId)
    actors.value = [...movie.actors]
  } else {
    actors.value = [...actors.value, { name }]
  }
}

async function removeActor(actor) {
  if (isEdit.value && actor.id) {
    await window.api.movies.removeActor(props.movieId, actor.id)
    actors.value = actors.value.filter((a) => a.id !== actor.id)
  } else {
    actors.value = actors.value.filter((a) => a !== actor)
  }
}

async function save() {
  error.value = null

  if (useImdbId.value) {
    if (!imdbIdInput.value.trim()) {
      error.value = 'Enter an IMDb ID.'
      return
    }
    if (!isEdit.value && !pathInput.value.trim()) {
      error.value = 'Enter the file path.'
      return
    }
  } else if (!fields.title.trim()) {
    error.value = 'Enter a title.'
    return
  } else if (!isEdit.value && !pathInput.value.trim()) {
    error.value = 'Enter the file path.'
    return
  }

  saving.value = true
  try {
    if (useImdbId.value) {
      if (isEdit.value) {
        await window.api.movies.refetchFromOmdb(props.movieId, imdbIdInput.value.trim())
      } else {
        await window.api.movies.createFromImdbId(imdbIdInput.value.trim(), pathInput.value.trim())
      }
    } else {
      const payload = {
        title: fields.title.trim(),
        year: fields.year.trim() || null,
        rated: fields.rated.trim() || null,
        imdb_rating: fields.imdb_rating === '' ? null : Number(fields.imdb_rating),
        runtime_label: fields.runtime_label.trim() || null,
        resolution_label: fields.resolution_label.trim() || null,
        plot: fields.plot.trim() || null,
        genreNames: genreNamesFromIds(genreIds.value)
      }
      if (isEdit.value) {
        await window.api.movies.update(props.movieId, payload)
      } else {
        payload.path = pathInput.value.trim()
        payload.actorNames = actors.value.map((a) => a.name)
        await window.api.movies.create(payload)
      }
    }
    emit('saved')
  } catch (e) {
    error.value = e.message ?? String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-box">
      <button class="dialog-box__close" @click="emit('close')">×</button>
      <h2 class="form__title">{{ isEdit ? 'Edit Movie' : 'Add Movie' }}</h2>

      <div v-if="loading" class="form__loading">Loading…</div>
      <template v-else>
        <label class="form__toggle">
          <input v-model="useImdbId" type="checkbox" />
          {{ isEdit ? 'Refetch from OMDb by IMDb ID' : 'Fetch from OMDb by IMDb ID' }}
        </label>

        <template v-if="useImdbId">
          <label class="form__field">
            <span>IMDb ID</span>
            <input v-model="imdbIdInput" type="text" placeholder="tt1234567" />
          </label>
          <label v-if="!isEdit" class="form__field">
            <span>File Path</span>
            <input v-model="pathInput" type="text" placeholder="C:\Movies\Some Movie.mkv" />
          </label>
        </template>

        <template v-else>
          <label class="form__field">
            <span>Title</span>
            <input v-model="fields.title" type="text" />
          </label>
          <div class="form__row">
            <label class="form__field">
              <span>Year</span>
              <input v-model="fields.year" type="text" />
            </label>
            <label class="form__field">
              <span>Rated</span>
              <input v-model="fields.rated" type="text" placeholder="PG-13" />
            </label>
            <label class="form__field">
              <span>IMDb Rating</span>
              <input v-model="fields.imdb_rating" type="number" step="0.1" min="0" max="10" />
            </label>
          </div>
          <div class="form__row">
            <label class="form__field">
              <span>Runtime</span>
              <input v-model="fields.runtime_label" type="text" placeholder="120 min" />
            </label>
            <label class="form__field">
              <span>Resolution</span>
              <input v-model="fields.resolution_label" type="text" placeholder="1920 x 1080" />
            </label>
          </div>
          <label class="form__field">
            <span>Genres</span>
            <MultiSelectDropdown label="Genres" :options="genreOptions" v-model="genreIds" />
          </label>
          <label class="form__field">
            <span>Plot</span>
            <textarea v-model="fields.plot" rows="3"></textarea>
          </label>
          <label v-if="!isEdit" class="form__field">
            <span>File Path</span>
            <input v-model="pathInput" type="text" placeholder="C:\Movies\Some Movie.mkv" />
          </label>
          <label v-else class="form__field">
            <span>File Path</span>
            <input :value="pathInput" type="text" readonly class="form__readonly" />
          </label>
          <div class="form__field">
            <span>Cast</span>
            <ActorChipList :actors="actors" @add="addActor" @remove="removeActor" />
          </div>
        </template>

        <p v-if="error" class="form__error">{{ error }}</p>

        <div class="form__actions">
          <button class="form__cancel" @click="emit('close')">Cancel</button>
          <button class="form__save" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </template>
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
  width: min(560px, 92vw);
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

.form__title {
  margin: 0 0 16px;
  font-size: 18px;
}

.form__loading {
  color: #8a8d97;
  font-size: 13px;
}

.form__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 14px;
  color: #c6c8d0;
}

.form__row {
  display: flex;
  gap: 10px;
}

.form__row .form__field {
  flex: 1;
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #a6a9b4;
}

.form__field input,
.form__field textarea {
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
}

.form__readonly {
  opacity: 0.6;
}

.form__error {
  color: #e08a8a;
  font-size: 13px;
  margin: 4px 0 12px;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.form__cancel {
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.form__cancel:hover {
  color: #e7e9ee;
  background: #2d2f37;
}

.form__save {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.form__save:hover:not(:disabled) {
  background: #454854;
}

.form__save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
