<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollectionsStore } from '../stores/collections'

// Shows only the collections a film is actually in. The previous component
// listed every collection in the library as a checkbox, which a TMDB import
// turns into a wall of hundreds for a film that belongs to one.
const props = defineProps({
  movieId: { type: Number, required: true },
  collections: { type: Array, required: true }, // [{ id, name }] - the film's own
  allowAdd: { type: Boolean, default: false }
})

const emit = defineEmits(['changed'])

const collectionsStore = useCollectionsStore()

const query = ref('')
const open = ref(false)
const root = ref(null)

const alreadyIn = computed(() => new Set(props.collections.map((c) => c.name.toLowerCase())))

// Collections the film isn't in yet, narrowed by what's been typed.
const suggestions = computed(() => {
  const typed = query.value.trim().toLowerCase()
  return collectionsStore.collections
    .filter((c) => !alreadyIn.value.has(c.name.toLowerCase()))
    .filter((c) => !typed || c.name.toLowerCase().includes(typed))
    .slice(0, 8)
})

// Offered whenever the typed text matches no existing collection exactly - the
// same name in another case is not "new", since the table is UNIQUE NOCASE.
const createCandidate = computed(() => {
  const typed = query.value.trim()
  if (!typed) return null
  const exists = collectionsStore.collections.some((c) => c.name.toLowerCase() === typed.toLowerCase())
  return exists ? null : typed
})

async function add(name) {
  await collectionsStore.addMovieByName(name, props.movieId)
  query.value = ''
  open.value = false
  emit('changed')
}

async function remove(collectionId) {
  await collectionsStore.removeMovie(collectionId, props.movieId)
  emit('changed')
}

// Enter picks the single obvious match, else creates what was typed.
function onEnter() {
  if (suggestions.value.length === 1) return add(suggestions.value[0].name)
  if (createCandidate.value) return add(createCandidate.value)
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => {
  // Only the add path needs the full list; the read-only chips come in as a prop.
  if (props.allowAdd) collectionsStore.fetch()
  document.addEventListener('click', onDocumentClick)
})
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="collection-chips">
    <div class="collection-chips__chips">
      <span v-for="collection in collections" :key="collection.id" class="collection-chip">
        {{ collection.name }}
        <button type="button" class="collection-chip__remove" title="Remove from collection" @click="remove(collection.id)">
          ×
        </button>
      </span>
      <span v-if="!collections.length" class="collection-chips__empty">Not in any collection.</span>
    </div>

    <div v-if="allowAdd" class="collection-chips__add">
      <input
        v-model="query"
        type="text"
        placeholder="Add to collection…"
        class="collection-chips__input"
        @focus="open = true"
        @input="open = true"
        @keyup.enter="onEnter"
      />
      <div v-if="open && (suggestions.length || createCandidate)" class="collection-chips__panel">
        <button
          v-for="collection in suggestions"
          :key="collection.id"
          type="button"
          class="collection-chips__option"
          @click="add(collection.name)"
        >
          {{ collection.name }}
          <span class="collection-chips__count">{{ collection.movie_count }}</span>
        </button>
        <button
          v-if="createCandidate"
          type="button"
          class="collection-chips__option collection-chips__option--create"
          @click="add(createCandidate)"
        >
          Create “{{ createCandidate }}”
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collection-chips {
  position: relative;
  flex: 1;
  min-width: 0;
}

.collection-chips__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Matches .actor-chip, so cast and collections read as the same kind of thing. */
.collection-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #2d2f37;
  border: 1px solid #3a3d47;
  border-radius: 14px;
  padding: 4px 6px 4px 10px;
  font-size: 12px;
}

.collection-chip__remove {
  background: transparent;
  border: none;
  color: #a6a9b4;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.collection-chip__remove:hover {
  color: #e08a8a;
}

.collection-chips__empty {
  color: #8a8d97;
  font-size: 12px;
}

.collection-chips__add {
  position: relative;
  margin-top: 8px;
}

.collection-chips__input {
  width: 100%;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
}

.collection-chips__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  max-height: 220px;
  overflow-y: auto;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.collection-chips__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  color: #e7e9ee;
  text-align: left;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.collection-chips__option:hover {
  background: #2d2f37;
}

.collection-chips__option--create {
  color: #bfc6ff;
}

.collection-chips__count {
  color: #6c7280;
  font-size: 11px;
}
</style>
