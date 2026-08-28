<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  movieId: { type: Number, required: true },
  path: { type: String, required: true }
})

const emit = defineEmits(['close', 'renamed'])

// Split the path client-side for display only - the main process recomputes
// everything from the DB row and is the single source of truth for filename
// rules, so nothing here validates beyond empty/unchanged.
const lastSep = computed(() => Math.max(props.path.lastIndexOf('\\'), props.path.lastIndexOf('/')))
const directory = computed(() => props.path.slice(0, lastSep.value + 1))
const fileName = computed(() => props.path.slice(lastSep.value + 1))
const dot = computed(() => fileName.value.lastIndexOf('.'))
const extension = computed(() => (dot.value > 0 ? fileName.value.slice(dot.value) : ''))
const currentBase = computed(() => (dot.value > 0 ? fileName.value.slice(0, dot.value) : fileName.value))

const name = ref('')
const saving = ref(false)
const error = ref('')
// The rename happened but the metadata refetch did not - the dialog stays up
// until the user acknowledges, since silently closing would look like success.
const warning = ref('')
const input = ref(null)

onMounted(() => {
  name.value = currentBase.value
  input.value?.focus()
  input.value?.select()
})

const unchanged = computed(() => name.value.trim() === '' || name.value.trim() === currentBase.value)

async function save() {
  if (unchanged.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await window.api.movies.renameFile(props.movieId, name.value.trim())
    if (result.warning) warning.value = result.warning
    emit('renamed')
    if (!result.warning) emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function onOverlayClick() {
  if (!saving.value) emit('close')
}
</script>

<template>
  <div class="dialog-overlay" @click.self="onOverlayClick">
    <div class="dialog-box">
      <h2 class="rename__title">Rename File</h2>

      <p class="rename__dir">{{ directory }}</p>

      <div class="rename__row">
        <input
          ref="input"
          v-model="name"
          type="text"
          class="rename__input"
          :disabled="saving || !!warning"
          @keyup.enter="save"
          @keyup.esc="onOverlayClick"
        />
        <span v-if="extension" class="rename__ext">{{ extension }}</span>
      </div>

      <p class="rename__hint">Metadata will be re-fetched from the new name.</p>

      <p v-if="error" class="rename__error">{{ error }}</p>
      <p v-if="warning" class="rename__warning">{{ warning }}</p>

      <div class="rename__actions">
        <template v-if="!warning">
          <button class="rename__cancel" :disabled="saving" @click="emit('close')">Cancel</button>
          <button class="rename__save" :disabled="saving || unchanged" @click="save">
            {{ saving ? 'Renaming and refetching…' : 'Rename' }}
          </button>
        </template>
        <button v-else class="rename__save" @click="emit('close')">Close</button>
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
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 20px 24px 24px;
  width: min(440px, 92vw);
}

.rename__title {
  margin: 0 0 12px;
  font-size: 17px;
}

.rename__dir {
  margin: 0 0 8px;
  font-size: 12px;
  color: #8a8d97;
  word-break: break-all;
}

.rename__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rename__input {
  flex: 1;
  min-width: 0;
  background: #2d2f37;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}

.rename__ext {
  font-size: 13px;
  color: #a6a9b4;
}

.rename__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8d97;
}

.rename__error {
  margin: 10px 0 0;
  font-size: 12px;
  color: #e08a8a;
}

.rename__warning {
  margin: 10px 0 0;
  font-size: 12px;
  color: #e0c48a;
}

.rename__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.rename__cancel {
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
}

.rename__cancel:hover {
  color: #e7e9ee;
}

.rename__save {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}

.rename__save:hover:enabled {
  background: #454854;
}

.rename__save:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
