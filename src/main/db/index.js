import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { applySchema } from './schema'
import { log } from '../log'

let db = null

export function getDb() {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'movie-library.sqlite')
  // Fires for EVERY statement that runs, not just failing ones - the search
  // box alone would roll the log file over - so this is a dev opt-in, never a
  // default. Actual DB failures arrive as thrown SqliteErrors and are logged
  // with their SQLITE_* code by the IPC wrapper.
  const verbose = process.env.MOVIELIB_LOG_SQL === '1' ? (sql) => log.debug('db', sql) : undefined

  db = new Database(dbPath, { verbose })

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  applySchema(db)

  return db
}
