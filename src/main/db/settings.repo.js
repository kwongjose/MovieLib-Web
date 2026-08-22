// Thin accessor over the key/value `settings` table. The table has existed
// since the first schema but had no repo - reads went through ad-hoc prepared
// statements in schema.js. TMDB needs a real one, since its key is read on
// every scan and written from the Settings UI.

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value ?? null
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function getTmdbKey(db) {
  const value = getSetting(db, 'tmdb_api_key')
  return value ? value.trim() : null
}

export function setTmdbKey(db, key) {
  setSetting(db, 'tmdb_api_key', (key ?? '').trim())
}
