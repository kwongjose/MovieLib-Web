<script setup>
import { ref } from 'vue'
import LibraryView from './views/LibraryView.vue'
import CollectionsView from './views/CollectionsView.vue'
import MaintenanceView from './views/MaintenanceView.vue'
import SettingsView from './views/SettingsView.vue'
import ScanProgressOverlay from './components/ScanProgressOverlay.vue'
import GenreManagerPopover from './components/GenreManagerPopover.vue'

const views = [
  { id: 'library', label: 'Library' },
  { id: 'collections', label: 'Collections' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'settings', label: 'Settings' }
]

const currentView = ref('library')
</script>

<template>
  <div class="app-shell">
    <nav class="app-nav">
      <button
        v-for="view in views"
        :key="view.id"
        class="app-nav__button"
        :class="{ 'app-nav__button--active': currentView === view.id }"
        @click="currentView = view.id"
      >
        {{ view.label }}
      </button>
      <!-- An action rather than a view, so it sits apart from the tabs. -->
      <GenreManagerPopover class="app-nav__action" />
    </nav>
    <main class="app-content">
      <LibraryView v-if="currentView === 'library'" />
      <CollectionsView v-else-if="currentView === 'collections'" />
      <MaintenanceView v-else-if="currentView === 'maintenance'" />
      <SettingsView v-else-if="currentView === 'settings'" />
    </main>
    <ScanProgressOverlay />
  </div>
</template>

<style>
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    height: 100%;
    margin: 0;
  }

  body {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1b1d22;
    color: #e7e9ee;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .app-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: #24262d;
    border-bottom: 1px solid #33353d;
    /* Above the page content so the genre popover isn't clipped by it. */
    position: relative;
    z-index: 20;
  }

  .app-nav__action {
    margin-left: auto;
  }

  .app-nav__button {
    background: transparent;
    border: none;
    color: #a6a9b4;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .app-nav__button:hover {
    background: #2d2f37;
    color: #e7e9ee;
  }

  .app-nav__button--active {
    background: #3a3d47;
    color: #ffffff;
  }

  .app-content {
    flex: 1;
    padding: 24px;
    overflow: auto;
  }
</style>
