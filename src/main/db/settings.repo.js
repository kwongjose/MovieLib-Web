// Maps DB rows (key/value) to a flat settings object the renderer works with.
const KEY_MAP = {
  omdbApiKey: 'omdb_api_key'
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const settings = {}
  for (const [publicKey, dbKey] of Object.entries(KEY_MAP)) {
    settings[publicKey] = byKey[dbKey] ?? null
  }
  return settings
}

export function setSettings(db, payload) {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value'
  )
  const applyAll = db.transaction((entries) => {
    for (const [key, value] of entries) upsert.run({ key, value })
  })

  const entries = Object.entries(payload)
    .filter(([publicKey]) => publicKey in KEY_MAP)
    .map(([publicKey, value]) => [KEY_MAP[publicKey], value])

  applyAll(entries)
  return getSettings(db)
}
