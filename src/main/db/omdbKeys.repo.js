export function listKeys(db) {
  return db.prepare('SELECT id, key, created_at FROM omdb_keys ORDER BY id').all()
}

// Just the key strings, in the order the importer should try them.
export function listKeyValues(db) {
  return listKeys(db).map((row) => row.key)
}

export function addKey(db, key) {
  const trimmed = key.trim()
  if (!trimmed) return null
  db.prepare('INSERT OR IGNORE INTO omdb_keys (key) VALUES (?)').run(trimmed)
  return db.prepare('SELECT id, key, created_at FROM omdb_keys WHERE key = ?').get(trimmed)
}

export function removeKey(db, id) {
  db.prepare('DELETE FROM omdb_keys WHERE id = ?').run(id)
}
