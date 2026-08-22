<script setup>
import { ref, onMounted } from 'vue'

// Direct window.api calls with local refs, matching MaintenanceView - a single
// scalar setting does not need a Pinia store the way the key *list* does.
const key = ref('')
const status = ref(null) // { ok, message }
const busy = ref(false)

onMounted(async () => {
  key.value = (await window.api.settings.getTmdbKey()) ?? ''
})

async function save() {
  busy.value = true
  try {
    await window.api.settings.setTmdbKey(key.value)
    status.value = { ok: true, message: 'Saved.' }
  } finally {
    busy.value = false
  }
}

// Worth its own button: an unusable TMDB key now stops an entire scan, where a
// bad OMDb key only costs a rating. Better to find out here than three minutes
// into a scan.
async function test() {
  busy.value = true
  status.value = null
  try {
    status.value = await window.api.settings.testTmdbKey(key.value)
  } catch (error) {
    status.value = { ok: false, message: error.message }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tmdb-key">
    <div class="tmdb-key__row">
      <input
        v-model="key"
        type="text"
        class="tmdb-key__input"
        placeholder="TMDB API key or read access token"
        @keyup.enter="save"
      />
      <button class="tmdb-key__button" :disabled="busy" @click="save">Save</button>
      <button class="tmdb-key__button" :disabled="busy" @click="test">Test</button>
    </div>

    <p v-if="status" class="tmdb-key__status" :class="status.ok ? 'tmdb-key__status--ok' : 'tmdb-key__status--bad'">
      {{ status.message }}
    </p>

    <p class="tmdb-key__hint">
      TMDB supplies titles, plots, cast, certificates, posters and trailers. Either credential
      works - the short API key or the long read access token.
    </p>
  </div>
</template>

<style scoped>
.tmdb-key__row {
  display: flex;
  gap: 8px;
}

.tmdb-key__input {
  flex: 1;
  background: #1b1d22;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 13px;
}

.tmdb-key__button {
  background: #3a3d47;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}

.tmdb-key__button:disabled {
  opacity: 0.6;
  cursor: default;
}

.tmdb-key__status {
  margin: 8px 0 0;
  font-size: 13px;
}

.tmdb-key__status--ok {
  color: #7ed492;
}

.tmdb-key__status--bad {
  color: #e08a8a;
}

.tmdb-key__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8a8d97;
}
</style>
