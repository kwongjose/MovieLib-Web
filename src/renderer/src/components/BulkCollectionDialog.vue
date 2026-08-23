<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCollectionsStore } from '../stores/collections'

// Acts on the ticked rows of the Library grid rather than one film, so putting
// three Thor films and three Captain America films into a shared "Marvel"
// takes two passes instead of six edit dialogs.
const props = defineProps({
  movieIds: { type: Array, required: true }
})

const emit = defineEmits(['close', 'changed'])

const collectionsStore = useCollectionsStore()

const query = ref('')
const memberships = ref([]) // [{ id, name, selected_count }]
const result = ref('')
const busy = ref(false)

// Deliberately not filtered by "already in", the way CollectionChipList does
// it: the selection has mixed membership, so a collection holding 3 of the 6
// ticked films is still a perfectly good target for the other 3.
const suggestions = computed(() => {
  const typed = query.value.trim().toLowerCase()
  return collectionsStore.collections
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

async function refreshMemberships() {
  memberships.value = await window.api.collections.listForMovies(props.movieIds)
}

async function add(name) {
  if (busy.value) return
  busy.value = true
  try {
    const linked = await collectionsStore.addMoviesByName(name, props.movieIds)
    if (!linked) return
    // "0 added" is the honest answer when every ticked film was already in it,
    // and is why the dialog never has to diff membership before writing.
    result.value = `Added ${linked.added} of ${props.movieIds.length} to "${linked.name}".`
    query.value = ''
    await refreshMemberships()
    emit('changed')
  } finally {
    busy.value = false
  }
}

async function removeFrom(collection) {
  if (busy.value) return
  busy.value = true
  try {
    const { removed } = await collectionsStore.removeMovies(collection.id, props.movieIds)
    result.value = `Removed ${removed} from "${collection.name}". The movies stay in your library.`
    await refreshMemberships()
    emit('changed')
  } finally {
    busy.value = false
  }
}

// Enter picks the single obvious match, else creates what was typed.
function onEnter() {
  if (suggestions.value.length === 1) return add(suggestions.value[0].name)
  if (createCandidate.value) return add(createCandidate.value)
}

onMounted(async () => {
  await collectionsStore.fetch()
  await refreshMemberships()
})
</script>

<template>
  <div class="bulk-collections__backdrop" @click.self="emit('close')">
    <div class="bulk-collections">
      <header class="bulk-collections__header">
        <h2 class="bulk-collections__title">{{ movieIds.length }} movie(s) selected</h2>
        <button class="bulk-collections__close" title="Close" @click="emit('close')">×</button>
      </header>

      <section class="bulk-collections__section">
        <h3 class="bulk-collections__heading">Add to collection</h3>
        <input
          v-model="query"
          type="text"
          placeholder="Type a collection name…"
          class="bulk-collections__input"
          @keyup.enter="onEnter"
        />
        <div v-if="suggestions.length || createCandidate" class="bulk-collections__panel">
          <button
            v-for="collection in suggestions"
            :key="collection.id"
            type="button"
            class="bulk-collections__option"
            :disabled="busy"
            @click="add(collection.name)"
          >
            {{ collection.name }}
            <span class="bulk-collections__count">{{ collection.movie_count }}</span>
          </button>
          <button
            v-if="createCandidate"
            type="button"
            class="bulk-collections__option bulk-collections__option--create"
            :disabled="busy"
            @click="add(createCandidate)"
          >
            Create "{{ createCandidate }}"
          </button>
        </div>
        <p v-else class="bulk-collections__empty">No collections yet - type a name to create one.</p>
      </section>

      <section class="bulk-collections__section">
        <h3 class="bulk-collections__heading">Remove from collection</h3>
        <!-- Only the collections the selection actually touches, with how much
             of it they hold, so a partial removal is visible before it happens. -->
        <ul v-if="memberships.length" class="bulk-collections__memberships">
          <li v-for="collection in memberships" :key="collection.id" class="bulk-collections__membership">
            <span class="bulk-collections__membership-name">{{ collection.name }}</span>
            <span class="bulk-collections__count">
              {{ collection.selected_count }} of {{ movieIds.length }} selected
            </span>
            <button
              type="button"
              class="bulk-collections__remove"
              :disabled="busy"
              @click="removeFrom(collection)"
            >
              Remove
            </button>
          </li>
        </ul>
        <p v-else class="bulk-collections__empty">None of the selected movies are in a collection.</p>
      </section>

      <!-- Inline result text rather than a toast: this app has no toast system,
           and Maintenance already reports bulk outcomes the same way. -->
      <p v-if="result" class="bulk-collections__result">{{ result }}</p>

      <footer class="bulk-collections__footer">
        <!-- Closing is the only exit: the selection is deliberately kept after
             each action, so Thor then Marvel is two passes in one sitting. -->
        <button class="bulk-collections__done" @click="emit('close')">Done</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.bulk-collections__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.bulk-collections {
  width: 440px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
}

.bulk-collections__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.bulk-collections__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e7e9ee;
}

.bulk-collections__close {
  background: transparent;
  border: none;
  color: #a6a9b4;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.bulk-collections__close:hover {
  color: #e7e9ee;
}

.bulk-collections__section {
  margin-bottom: 18px;
}

.bulk-collections__heading {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8d97;
}

.bulk-collections__input {
  width: 100%;
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
}

/* Matches .collection-chips__panel, so the two collection pickers in the app
   read as the same control. */
.bulk-collections__panel {
  margin-top: 6px;
  max-height: 200px;
  overflow-y: auto;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 8px;
  padding: 6px;
}

.bulk-collections__option {
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

.bulk-collections__option:hover:not(:disabled) {
  background: #2d2f37;
}

.bulk-collections__option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bulk-collections__option--create {
  color: #bfc6ff;
}

.bulk-collections__memberships {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bulk-collections__membership {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #24262d;
}

.bulk-collections__membership-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.bulk-collections__count {
  color: #6c7280;
  font-size: 11px;
  white-space: nowrap;
}

.bulk-collections__remove {
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.bulk-collections__remove:hover:not(:disabled) {
  color: #e08a8a;
  border-color: #e08a8a;
}

.bulk-collections__remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bulk-collections__empty {
  color: #8a8d97;
  font-size: 12px;
  margin: 0;
}

.bulk-collections__result {
  color: #bfc6ff;
  font-size: 12px;
  margin: 0 0 14px;
}

.bulk-collections__footer {
  display: flex;
  justify-content: flex-end;
}

.bulk-collections__done {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
}

.bulk-collections__done:hover {
  background: #454854;
}
</style>
