<script setup>
import { onMounted } from 'vue'
import { useFoldersStore } from '../stores/folders'

const foldersStore = useFoldersStore()

onMounted(() => foldersStore.fetch())
</script>

<template>
  <div class="watch-folder-list">
    <ul class="watch-folder-list__items">
      <li v-for="folder in foldersStore.folders" :key="folder.id" class="watch-folder-list__item">
        <span class="watch-folder-list__path">{{ folder.path }}</span>
        <button class="watch-folder-list__remove" @click="foldersStore.remove(folder.id)">Remove</button>
      </li>
      <li v-if="!foldersStore.folders.length" class="watch-folder-list__empty">
        No folders added yet - scans have nothing to look at until you add one.
      </li>
    </ul>
    <button class="watch-folder-list__add" @click="foldersStore.add()">Add Folder…</button>
  </div>
</template>

<style scoped>
.watch-folder-list__items {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.watch-folder-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #24262d;
  border: 1px solid #33353d;
  border-radius: 6px;
  padding: 8px 12px;
}

.watch-folder-list__path {
  font-size: 13px;
  color: #e7e9ee;
  overflow-wrap: anywhere;
}

.watch-folder-list__remove {
  background: transparent;
  border: 1px solid #4a3a3a;
  color: #e08a8a;
  border-radius: 5px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

.watch-folder-list__remove:hover {
  background: #3a2a2a;
}

.watch-folder-list__empty {
  color: #8a8d97;
  font-size: 13px;
  padding: 8px 0;
}

.watch-folder-list__add {
  background: #3a3d47;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.watch-folder-list__add:hover {
  background: #454854;
}
</style>
