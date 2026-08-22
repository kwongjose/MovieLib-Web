<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useTrailerStore } from '../stores/trailer'

const trailerStore = useTrailerStore()

// The three dialogs all sit at z-index 200 and none of them handle Esc, so this
// is the only keyboard handler in the app - nothing to conflict with, and
// nothing to inherit either.
function onKeydown(event) {
  if (event.key === 'Escape' && trailerStore.isOpen) trailerStore.close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function openOnYouTube() {
  if (trailerStore.watchUrl) window.api.system.openExternal(trailerStore.watchUrl)
}
</script>

<template>
  <div v-if="trailerStore.isOpen" class="trailer-overlay" @click.self="trailerStore.close">
    <div class="trailer-overlay__box">
      <div class="trailer-overlay__header">
        <span class="trailer-overlay__title">{{ trailerStore.movie.title }}</span>
        <button class="trailer-overlay__close" title="Close (Esc)" @click="trailerStore.close">
          ×
        </button>
      </div>

      <div class="trailer-overlay__frame">
        <!--
          Points at the loopback wrapper page, not YouTube directly: a file://
          renderer sends no referrer and YouTube's player refuses to start
          (error 153). The wrapper supplies a real http origin. `allow` has to
          be set here as well as on the inner frame - a permission the outer
          frame does not delegate cannot reach the inner one.
        -->
        <iframe
          v-if="trailerStore.embedUrl"
          :src="trailerStore.embedUrl"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen
        ></iframe>
        <p v-else class="trailer-overlay__error">
          {{ trailerStore.error || 'Preparing the player…' }}
        </p>
      </div>

      <div class="trailer-overlay__actions">
        <button class="trailer-overlay__link" @click="openOnYouTube">Open on YouTube</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Above the 200 the three dialogs share, so a trailer layers over an open
   detail or compare view instead of replacing it. */
.trailer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 7, 10, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.trailer-overlay__box {
  width: min(1100px, 92vw);
  background: #17181d;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 14px;
}

.trailer-overlay__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.trailer-overlay__title {
  font-size: 15px;
  font-weight: 600;
  color: #e7e9ee;
}

.trailer-overlay__close {
  margin-left: auto;
  background: none;
  border: none;
  color: #a6a9b4;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.trailer-overlay__close:hover {
  color: #e7e9ee;
}

/* 16:9 without aspect-ratio, which Chromium 108 supports but which behaves
   inconsistently inside a flex parent at this size. */
.trailer-overlay__frame {
  position: relative;
  width: 100%;
  padding-top: 56.25%;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
}

.trailer-overlay__frame iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.trailer-overlay__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: #a6a9b4;
  font-size: 14px;
}

.trailer-overlay__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.trailer-overlay__link {
  background: none;
  border: none;
  color: #bfc6ff;
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
}

.trailer-overlay__link:hover {
  text-decoration: underline;
}
</style>
