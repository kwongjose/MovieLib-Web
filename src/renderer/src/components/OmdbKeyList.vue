<script setup>
import { ref, onMounted } from 'vue'
import { useOmdbKeysStore } from '../stores/omdbKeys'

const keysStore = useOmdbKeysStore()
const newKey = ref('')

onMounted(() => keysStore.fetch())

async function addKey() {
  const value = newKey.value.trim()
  if (!value) return
  await keysStore.add(value)
  newKey.value = ''
}
</script>

<template>
  <div class="keys">
    <ol class="keys__list">
      <li v-for="(entry, i) in keysStore.keys" :key="entry.id" class="keys__item">
        <span class="keys__order">{{ i + 1 }}</span>
        <code class="keys__value">{{ entry.key }}</code>
        <button class="keys__remove" @click="keysStore.remove(entry.id)">Remove</button>
      </li>
      <li v-if="keysStore.loaded && !keysStore.keys.length" class="keys__empty">
        No keys yet - scanning and IMDb lookups need at least one.
      </li>
    </ol>

    <div class="keys__add">
      <input v-model="newKey" type="text" placeholder="Add another OMDb key" @keyup.enter="addKey" />
      <button @click="addKey">Add</button>
    </div>
  </div>
</template>

<style scoped>
.keys__list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.keys__item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #24262d;
  border: 1px solid #33353d;
  border-radius: 6px;
  padding: 8px 12px;
}

.keys__order {
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #33353d;
  color: #a6a9b4;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.keys__value {
  flex: 1;
  font-family: Consolas, monospace;
  font-size: 13px;
  color: #e7e9ee;
  overflow-wrap: anywhere;
}

.keys__remove {
  background: transparent;
  border: 1px solid #4a3a3a;
  color: #e08a8a;
  border-radius: 5px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

.keys__remove:hover {
  background: #3a2a2a;
}

.keys__empty {
  color: #8a8d97;
  font-size: 13px;
  padding: 4px 0;
}

.keys__add {
  display: flex;
  gap: 8px;
}

.keys__add input {
  flex: 1;
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
}

.keys__add button {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.keys__add button:hover {
  background: #454854;
}
</style>
