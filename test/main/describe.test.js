import { describe, it, expect } from 'vitest'
import { describeError, summarizeArgs, SENSITIVE_CHANNELS } from '../../src/main/log/describe'

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('describeError', () => {
  it('names the error and keeps the message', () => {
    const out = describeError(new TypeError('x is not a function'))
    expect(out.error).toBe('TypeError')
    expect(out.message).toBe('x is not a function')
  })

  // The whole reason `code` is captured: this is what makes a DB failure
  // actionable rather than just "constraint failed".
  it('surfaces a SQLite error code', () => {
    const error = new Error('FOREIGN KEY constraint failed')
    error.name = 'SqliteError'
    error.code = 'SQLITE_CONSTRAINT_FOREIGNKEY'

    const out = describeError(error)
    expect(out.error).toBe('SqliteError')
    expect(out.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')
  })

  it('surfaces an fs error code', () => {
    const error = new Error('resource busy or locked')
    error.code = 'EBUSY'
    expect(describeError(error).code).toBe('EBUSY')
  })

  // The API clients declare `class TmdbAuthError extends Error {}` with no
  // `name` of their own, so they inherit name === 'Error'. Reading name alone
  // would log every API failure as a generic Error and lose the one detail
  // that distinguishes a rejected key from an unreachable network.
  it('names a subclass that never sets .name', () => {
    class TmdbAuthError extends Error {}
    expect(describeError(new TmdbAuthError('rejected')).error).toBe('TmdbAuthError')
  })

  it('omits code when there is none', () => {
    expect(describeError(new Error('plain')).code).toBeUndefined()
  })

  it('captures exactly one stack frame', () => {
    const out = describeError(new Error('boom'))
    expect(out.at).toMatch(/^at /)
    expect(out.at).not.toContain('\n')
  })

  it('tolerates non-errors', () => {
    expect(describeError('just a string').message).toBe('just a string')
    expect(describeError(null).error).toBe('Unknown')
    expect(describeError(undefined).error).toBe('Unknown')
  })
})

describe('summarizeArgs', () => {
  // The point of the whole SENSITIVE_CHANNELS mechanism: these arguments ARE
  // the credential, so not even a truncated prefix may be written.
  it.each([...SENSITIVE_CHANNELS])('never logs arguments for %s', (channel) => {
    const out = summarizeArgs(channel, [KEY])
    expect(out).toBe('<redacted>')
    expect(JSON.stringify(out)).not.toContain(KEY)
  })

  it('keeps ordinary scalar arguments, which are the useful part', () => {
    expect(summarizeArgs('movies:getById', [42])).toEqual([42])
    expect(summarizeArgs('movies:delete', [7, true])).toEqual([7, true])
    expect(summarizeArgs('movies:refetchFromTmdb', [999999, 'tt0133093'])).toEqual([999999, 'tt0133093'])
  })

  it('truncates long strings', () => {
    const long = 'x'.repeat(200)
    const [out] = summarizeArgs('movies:create', [long])
    expect(out.length).toBeLessThanOrEqual(81)
  })

  it('summarizes arrays and objects without dumping them', () => {
    expect(summarizeArgs('collections:removeMovies', [[1, 2, 3]])).toEqual(['Array(3)'])
    expect(summarizeArgs('movies:list', [{ search: 'x', sortBy: 'title' }])).toEqual(['{search,sortBy}'])
  })

  it('handles null and missing arguments', () => {
    expect(summarizeArgs('movies:getById', [null])).toEqual([null])
    expect(summarizeArgs('movies:list', undefined)).toEqual([])
  })
})
