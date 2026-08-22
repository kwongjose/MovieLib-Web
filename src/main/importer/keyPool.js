// Hands out OMDb keys in order and steps to the next one when the current
// key reports its daily limit. Kept free of any I/O so the rotation rules can
// be tested without spending a real day's quota.
export function createKeyPool(keys) {
  const ordered = [...keys]
  const exhausted = new Set()
  let index = 0

  function advancePastExhausted() {
    while (index < ordered.length && exhausted.has(ordered[index])) index++
  }

  return {
    current() {
      advancePastExhausted()
      return index < ordered.length ? ordered[index] : null
    },

    // Reports that `key` is out of quota. Returns true if another key is
    // still available.
    //
    // Takes the key rather than assuming the current one: with several
    // lookups in flight at once they can all fail on the same key, and
    // blindly incrementing would burn through the remaining keys without
    // ever trying them. Marking by identity makes repeated reports for the
    // same key idempotent.
    markExhausted(key) {
      exhausted.add(key)
      advancePastExhausted()
      return index < ordered.length
    },

    exhaustedCount() {
      return exhausted.size
    },

    total() {
      return ordered.length
    }
  }
}
