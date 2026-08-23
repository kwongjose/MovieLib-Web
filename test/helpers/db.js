import { createRequire } from 'node:module'
import { applySchema } from '../../src/main/db/schema'

// The aliased copy, which ships a prebuilt binary for the current Node. The
// primary better-sqlite3 is whatever electron-rebuild (or a build:win, which
// leaves an ia32 binary behind) last made it, so tests must not depend on it.
//
// Deliberately a newer major than the app's 8.7.0: this machine has no MSVC
// toolchain, so anything without a Node-22 prebuild cannot be installed at all.
// The gap is SQLite 3.49 here vs 3.43 in the app - no difference in behaviour
// for anything under test (UNIQUE COLLATE NOCASE, INSERT/UPDATE OR IGNORE,
// ON DELETE CASCADE) - but it is why the versions are not pinned together.
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3-node')

export function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON') // matches src/main/db/index.js - the merge relies on ON DELETE CASCADE
  applySchema(db)
  return db
}

// movies.path is NOT NULL UNIQUE, so a title alone will not insert. Derived
// from the title to keep it unique without every caller having to invent one.
export function addMovie(db, title) {
  const path = '/movies/' + title.replace(/[^a-z0-9]+/gi, '_') + '.mkv'
  return db.prepare('INSERT INTO movies (title, path) VALUES (?, ?)').run(title, path).lastInsertRowid
}

// Inserts a collection name verbatim, bypassing normalization - the only way to
// reproduce the rows an already-imported database is carrying.
export function insertRawCollection(db, name) {
  return db.prepare('INSERT INTO collections (name) VALUES (?)').run(name).lastInsertRowid
}

export function link(db, collectionId, movieId) {
  db.prepare('INSERT INTO movie_collections (collection_id, movie_id) VALUES (?, ?)').run(collectionId, movieId)
}

export function namesIn(db, collectionName) {
  return db
    .prepare(
      `SELECT m.title FROM movies m
       JOIN movie_collections mc ON mc.movie_id = m.id
       JOIN collections c ON c.id = mc.collection_id
       WHERE c.name = ? COLLATE NOCASE
       ORDER BY m.title`
    )
    .all(collectionName)
    .map((r) => r.title)
}
