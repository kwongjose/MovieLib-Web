<script setup>
import { computed } from 'vue'
import { useScanStore } from '../stores/scan'

const scanStore = useScanStore()

function describeKeyFailures(result) {
  const parts = []
  if (result.keysRateLimited) parts.push(`${result.keysRateLimited} out of quota`)
  if (result.keysInvalid) parts.push(`${result.keysInvalid} invalid`)
  return parts.join(', ')
}

const keyFailureSummary = computed(() => describeKeyFailures(scanStore.result ?? {}))

// A scan that finished but burned through keys on the way is still worth
// flagging - those keys won't be there for the next run.
const keyFailoverNote = computed(() => {
  const result = scanStore.result
  if (!result) return ''
  const summary = describeKeyFailures(result)
  if (!summary) return ''
  return `Switched keys during the scan (${summary} of ${result.keysTotal}).`
})

const percent = computed(() => {
  const p = scanStore.progress
  if (!p || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})
</script>

<template>
  <div v-if="scanStore.scanning" class="scan-overlay">
    <div class="scan-overlay__box">
      <p class="scan-overlay__title">Scanning for new movies…</p>
      <p v-if="scanStore.progress" class="scan-overlay__detail">
        {{ scanStore.progress.current }} / {{ scanStore.progress.total }}
      </p>
      <p v-if="scanStore.progress?.currentFile" class="scan-overlay__file">
        {{ scanStore.progress.currentFile }}
      </p>
      <div class="scan-overlay__bar">
        <div class="scan-overlay__bar-fill" :style="{ width: `${percent}%` }"></div>
      </div>
    </div>
  </div>

  <div v-else-if="scanStore.result || scanStore.error" class="scan-result">
    <p v-if="scanStore.error" class="scan-result__error">{{ scanStore.error }}</p>
    <p v-else class="scan-result__summary">
      Imported {{ scanStore.result.imported }} of {{ scanStore.result.total }} new file(s).
      <span v-if="scanStore.result.skipped">{{ scanStore.result.skipped }} skipped (not found on OMDb).</span>
      <span v-if="scanStore.result.stopReason === 'keys-unavailable'" class="scan-result__warning">
        Stopped early - no usable OMDb keys left ({{ keyFailureSummary }}). Run again tomorrow,
        or add another key in Settings.
      </span>
      <span v-else-if="scanStore.result.stopReason === 'network'" class="scan-result__warning">
        Stopped early - could not reach OMDb. Check your internet connection.
      </span>
      <span v-else-if="keyFailoverNote" class="scan-result__note">{{ keyFailoverNote }}</span>
    </p>
    <button class="scan-result__dismiss" @click="scanStore.dismiss">Dismiss</button>
  </div>
</template>

<style scoped>
.scan-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 11, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.scan-overlay__box {
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 10px;
  padding: 24px 28px;
  min-width: 360px;
  text-align: center;
}

.scan-overlay__title {
  margin: 0 0 8px;
  font-size: 15px;
}

.scan-overlay__detail {
  margin: 0 0 6px;
  color: #a6a9b4;
  font-size: 13px;
}

.scan-overlay__file {
  margin: 0 0 14px;
  color: #6c7280;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.scan-overlay__bar {
  height: 6px;
  border-radius: 4px;
  background: #33353d;
  overflow: hidden;
}

.scan-overlay__bar-fill {
  height: 100%;
  background: #6c7bff;
  transition: width 0.2s ease;
}

.scan-result {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  background: #24262d;
  border: 1px solid #3a3d47;
  border-radius: 8px;
  padding: 14px 16px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.scan-result__summary {
  margin: 0;
  font-size: 13px;
}

.scan-result__error {
  margin: 0;
  font-size: 13px;
  color: #e08a8a;
}

.scan-result__warning {
  display: block;
  color: #e0c48a;
  margin-top: 4px;
}

.scan-result__note {
  display: block;
  color: #a6a9b4;
  margin-top: 4px;
}

.scan-result__dismiss {
  align-self: flex-end;
  background: transparent;
  border: 1px solid #3a3d47;
  color: #a6a9b4;
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.scan-result__dismiss:hover {
  color: #e7e9ee;
  background: #2d2f37;
}
</style>
