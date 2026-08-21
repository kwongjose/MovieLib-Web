<script setup>
import { onMounted, computed } from 'vue'
import { useCollectionsStore } from '../stores/collections'

const props = defineProps({
  movieId: { type: Number, required: true },
  selectedCollections: { type: Array, required: true } // [{ id, name }]
})

const emit = defineEmits(['changed'])

const collectionsStore = useCollectionsStore()
onMounted(() => collectionsStore.fetch())

const selectedIds = computed(() => new Set(props.selectedCollections.map((c) => c.id)))

async function toggle(collectionId) {
  if (selectedIds.value.has(collectionId)) {
    await collectionsStore.removeMovie(collectionId, props.movieId)
  } else {
    await collectionsStore.addMovie(collectionId, props.movieId)
  }
  emit('changed')
}
</script>

<template>
  <div class="collection-picker">
    <label v-for="collection in collectionsStore.collections" :key="collection.id" class="collection-picker__option">
      <input type="checkbox" :checked="selectedIds.has(collection.id)" @change="toggle(collection.id)" />
      {{ collection.name }}
    </label>
    <p v-if="!collectionsStore.collections.length" class="collection-picker__empty">
      No collections yet - create one in the Collections tab.
    </p>
  </div>
</template>

<style scoped>
.collection-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.collection-picker__option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #c6c8d0;
  cursor: pointer;
}

.collection-picker__empty {
  margin: 0;
  font-size: 12px;
  color: #8a8d97;
}
</style>
