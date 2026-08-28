import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeDb } from '../helpers/db'
import { findMovieIdByPathNocase } from '../../src/main/db/movies.repo'

// movies.path is UNIQUE but case-sensitive; Windows filenames are not. The
// rename pre-check has to catch a collision under any casing while never
// matching the row being renamed itself.
describe('findMovieIdByPathNocase', () => {
  let db

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    db.close()
  })

  function insert(title, path) {
    return db.prepare('INSERT INTO movies (title, path) VALUES (?, ?)').run(title, path).lastInsertRowid
  }

  it('finds a row whose path differs only in casing', () => {
    const id = insert('The Matrix', 'G:\\movie\\The Matrix (1999).mkv')
    expect(findMovieIdByPathNocase(db, 'g:\\movie\\the matrix (1999).MKV', -1)).toBe(id)
  })

  it('excludes the row being renamed', () => {
    const id = insert('The Matrix', 'G:\\movie\\The Matrix (1999).mkv')
    expect(findMovieIdByPathNocase(db, 'G:\\movie\\The Matrix (1999).mkv', id)).toBeNull()
  })

  it('returns null when no row uses the path', () => {
    insert('The Matrix', 'G:\\movie\\The Matrix (1999).mkv')
    expect(findMovieIdByPathNocase(db, 'G:\\movie\\Heat (1995).mkv', -1)).toBeNull()
  })
})
