<script setup>
import { ref } from 'vue'

defineProps({
  actors: { type: Array, required: true } // [{ id?, name }]
})

const emit = defineEmits(['add', 'remove'])

const newActorName = ref('')

function submitAdd() {
  const name = newActorName.value.trim()
  if (!name) return
  emit('add', name)
  newActorName.value = ''
}
</script>

<template>
  <div class="actor-chip-list">
    <div class="actor-chip-list__chips">
      <span v-for="actor in actors" :key="actor.id ?? actor.name" class="actor-chip">
        {{ actor.name }}
        <button type="button" class="actor-chip__remove" @click="emit('remove', actor)">×</button>
      </span>
      <span v-if="!actors.length" class="actor-chip-list__empty">No cast members yet.</span>
    </div>
    <div class="actor-chip-list__add">
      <input
        v-model="newActorName"
        type="text"
        placeholder="Actor name"
        class="actor-chip-list__input"
        @keyup.enter="submitAdd"
      />
      <button type="button" class="actor-chip-list__add-btn" @click="submitAdd">Add</button>
    </div>
  </div>
</template>

<style scoped>
.actor-chip-list__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.actor-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #2d2f37;
  border: 1px solid #3a3d47;
  border-radius: 14px;
  padding: 4px 6px 4px 10px;
  font-size: 12px;
}

.actor-chip__remove {
  background: transparent;
  border: none;
  color: #a6a9b4;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.actor-chip__remove:hover {
  color: #e08a8a;
}

.actor-chip-list__empty {
  color: #8a8d97;
  font-size: 12px;
}

.actor-chip-list__add {
  display: flex;
  gap: 6px;
}

.actor-chip-list__input {
  flex: 1;
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}

.actor-chip-list__add-btn {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.actor-chip-list__add-btn:hover {
  background: #454854;
}
</style>
