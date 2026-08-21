export function listFolders(db) {
  return db.prepare('SELECT id, path, created_at FROM watch_folders ORDER BY created_at').all()
}

export function addFolder(db, folderPath) {
  db.prepare('INSERT OR IGNORE INTO watch_folders (path) VALUES (?)').run(folderPath)
  return db.prepare('SELECT id, path, created_at FROM watch_folders WHERE path = ?').get(folderPath)
}

// Only stops future scans from covering this folder - movies already
// imported from it are untouched (see "Known accepted limitation" in the plan).
export function removeFolder(db, id) {
  db.prepare('DELETE FROM watch_folders WHERE id = ?').run(id)
}
