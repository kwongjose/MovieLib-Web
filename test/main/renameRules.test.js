import { describe, it, expect } from 'vitest'
import {
  validateBaseName,
  isCaseOnlyRename,
  pathTooLong,
  MAX_PATH
} from '../../src/main/importer/renameRules.js'

describe('validateBaseName', () => {
  it('accepts ordinary movie names', () => {
    expect(validateBaseName('The Matrix (1999)')).toBeNull()
    expect(validateBaseName('Blade Runner 2049 (2017)')).toBeNull()
    expect(validateBaseName('Amelie (tt0211915)')).toBeNull()
    expect(validateBaseName('Movie - Part 2, Redux')).toBeNull()
    expect(validateBaseName("One Flew Over the Cuckoo's Nest (1975)")).toBeNull()
  })

  it('rejects empty and whitespace-only names', () => {
    expect(validateBaseName('')).toBeTruthy()
    expect(validateBaseName('   ')).toBeTruthy()
    expect(validateBaseName(null)).toBeTruthy()
    expect(validateBaseName(undefined)).toBeTruthy()
  })

  it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])(
    'rejects the illegal character %s',
    (ch) => {
      expect(validateBaseName(`Movie ${ch} Name`)).toContain('cannot contain')
    }
  )

  it('rejects control characters', () => {
    expect(validateBaseName(`Movie${String.fromCharCode(7)}Name`)).toContain('cannot contain')
    expect(validateBaseName(`Movie${String.fromCharCode(31)}Name`)).toContain('cannot contain')
  })

  it('rejects trailing dots and spaces (Win32 strips them silently)', () => {
    expect(validateBaseName('Movie.')).toContain('cannot end')
    expect(validateBaseName('Movie ')).toContain('cannot end')
  })

  it('allows inner dots and spaces', () => {
    expect(validateBaseName('Mr. Smith Goes to Washington (1939)')).toBeNull()
    expect(validateBaseName('The.Matrix.1999')).toBeNull()
  })

  it('rejects Windows reserved device names, case-insensitively', () => {
    expect(validateBaseName('con')).toContain('reserved')
    expect(validateBaseName('CON')).toContain('reserved')
    expect(validateBaseName('Con.backup')).toContain('reserved')
    expect(validateBaseName('nul')).toContain('reserved')
    expect(validateBaseName('com1')).toContain('reserved')
    expect(validateBaseName('LPT9')).toContain('reserved')
  })

  it('accepts names that merely start with a reserved word', () => {
    expect(validateBaseName('console')).toBeNull()
    expect(validateBaseName('com10')).toBeNull()
    expect(validateBaseName('conan the barbarian')).toBeNull()
  })
})

describe('isCaseOnlyRename', () => {
  it('detects a casing-only change', () => {
    expect(isCaseOnlyRename('movie.mkv', 'Movie.mkv')).toBe(true)
    expect(isCaseOnlyRename('movie.mkv', 'MOVIE.MKV')).toBe(true)
  })

  it('is false for identical names', () => {
    expect(isCaseOnlyRename('Movie.mkv', 'Movie.mkv')).toBe(false)
  })

  it('is false for genuinely different names', () => {
    expect(isCaseOnlyRename('movie.mkv', 'other.mkv')).toBe(false)
  })
})

describe('pathTooLong', () => {
  it('accepts a path at exactly MAX_PATH', () => {
    expect(pathTooLong('C:'.padEnd(MAX_PATH, 'a'))).toBe(false)
  })

  it('rejects a path one character over', () => {
    expect(pathTooLong('C:'.padEnd(MAX_PATH + 1, 'a'))).toBe(true)
  })
})
