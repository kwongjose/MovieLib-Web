<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true }, // [{ value, label }]
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)

const summary = computed(() => {
  return props.modelValue.length ? `${props.label} (${props.modelValue.length})` : props.label
})

function toggleOption(value) {
  const next = new Set(props.modelValue)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  emit('update:modelValue', [...next])
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="msd">
    <button type="button" class="msd__trigger" :class="{ 'msd__trigger--active': modelValue.length }" @click="open = !open">
      {{ summary }} <span class="msd__caret">▾</span>
    </button>
    <div v-if="open" class="msd__panel">
      <label v-for="opt in options" :key="opt.value" class="msd__option">
        <input
          type="checkbox"
          :checked="modelValue.includes(opt.value)"
          @change="toggleOption(opt.value)"
        />
        {{ opt.label }}
      </label>
      <p v-if="!options.length" class="msd__empty">No options.</p>
    </div>
  </div>
</template>

<style scoped>
.msd {
  position: relative;
  display: inline-block;
}

.msd__trigger {
  background: #2d2f37;
  color: #e7e9ee;
  border: 1px solid #3a3d47;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
}

.msd__trigger--active {
  border-color: #6c7bff;
  color: #bfc6ff;
}

.msd__caret {
  opacity: 0.6;
}

.msd__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 160px;
  max-height: 260px;
  overflow-y: auto;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.msd__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.msd__option:hover {
  background: #2d2f37;
}

.msd__empty {
  margin: 4px 8px;
  font-size: 12px;
  color: #8a8d97;
}
</style>
