import { describe, it, expect } from 'vitest'
import { cleanIpcErrorMessage } from '../../src/preload/ipcError'

describe('cleanIpcErrorMessage', () => {
  // The two messages that prompted this: both are instructions, and both
  // arrived at the user looking like a crash.
  it('strips the wrapper from a plain Error', () => {
    expect(
      cleanIpcErrorMessage(
        "Error invoking remote method 'scan:start': Error: Add at least one library folder in Settings before scanning."
      )
    ).toBe('Add at least one library folder in Settings before scanning.')
  })

  it('strips the wrapper from the backfill message', () => {
    expect(
      cleanIpcErrorMessage(
        "Error invoking remote method 'movies:backfillRatings': Error: Add an OMDb API key in Settings first."
      )
    ).toBe('Add an OMDb API key in Settings first.')
  })

  it.each([
    ['SqliteError', 'FOREIGN KEY constraint failed'],
    ['TypeError', 'x is not a function'],
    ['TmdbAuthError', 'TMDB rejected the API key']
  ])('strips a %s class name too', (className, message) => {
    expect(cleanIpcErrorMessage(`Error invoking remote method 'movies:refetchFromTmdb': ${className}: ${message}`)).toBe(
      message
    )
  })

  it('strips the wrapper when a non-Error was thrown', () => {
    expect(cleanIpcErrorMessage("Error invoking remote method 'movies:list': something odd")).toBe('something odd')
  })

  it('leaves an unwrapped message alone', () => {
    expect(cleanIpcErrorMessage('The file is in use by another program.')).toBe(
      'The file is in use by another program.'
    )
  })

  it('tolerates a missing message', () => {
    expect(cleanIpcErrorMessage(undefined)).toBe('')
    expect(cleanIpcErrorMessage(null)).toBe('')
  })
})
