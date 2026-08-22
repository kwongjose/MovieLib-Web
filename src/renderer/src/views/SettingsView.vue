<script setup>
import WatchFolderList from '../components/WatchFolderList.vue'
import OmdbKeyList from '../components/OmdbKeyList.vue'

const isDev = import.meta.env.DEV

async function revealDatabaseFile() {
  await window.api.system.revealDatabaseFile()
}

async function seedFakeMovies() {
  await window.api.dev.seedFakeMovies()
}
</script>

<template>
  <div class="settings-view">
    <section class="settings-view__section">
      <h2>OMDb API Keys</h2>
      <p class="settings-view__hint">
        Get a free key at omdbapi.com. At least one is required for scanning and IMDb lookups.
        Add several and they're used in the order shown - when one hits its daily limit
        (1000 lookups on the free tier) the next takes over automatically.
      </p>
      <OmdbKeyList />
    </section>

    <section class="settings-view__section">
      <h2>Library Folders</h2>
      <p class="settings-view__hint">
        Folders scanned when importing new movies, finding not-yet-imported files, and checking
        for missing files - no need to pick a folder each time.
      </p>
      <WatchFolderList />
    </section>

    <section class="settings-view__section">
      <h2>Database</h2>
      <p class="settings-view__hint">
        There's no cloud sync - this is the only backup path available.
      </p>
      <button class="settings-view__reveal" @click="revealDatabaseFile">Reveal Database File</button>
    </section>

    <section v-if="isDev" class="settings-view__section settings-view__section--dev">
      <h2>Developer</h2>
      <p class="settings-view__hint">Dev-only: seeds fake movies so the library UI can be built before the importer exists.</p>
      <button class="settings-view__reveal" @click="seedFakeMovies">Seed Test Data</button>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 640px;
}

.settings-view__section h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.settings-view__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #8a8d97;
}

.settings-view__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-view__input {
  flex: 1;
  background: #24262d;
  border: 1px solid #3a3d47;
  color: #e7e9ee;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
}

.settings-view__save,
.settings-view__reveal {
  background: #3a3d47;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.settings-view__save:hover,
.settings-view__reveal:hover {
  background: #454854;
}

.settings-view__saved {
  color: #7ed492;
  font-size: 13px;
}

.settings-view__section--dev {
  border-top: 1px dashed #3a3d47;
  padding-top: 20px;
}
</style>
