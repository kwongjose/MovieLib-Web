import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { applySchema } from './schema'

let db = null

export function getDb() {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'movie-library.sqlite')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  applySchema(db)

  return db
}
