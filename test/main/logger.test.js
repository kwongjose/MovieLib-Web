import { describe, it, expect } from 'vitest'
import { createLogger, formatEntry, LEVELS } from '../../src/main/log/logger'

const AT = new Date('2026-10-19T14:32:07.421')
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

function arraySink(level = 'info') {
  const lines = []
  return { lines, logger: createLogger({ write: (line) => lines.push(line), level, now: () => AT }) }
}

describe('formatEntry', () => {
  it('writes timestamp, padded level, padded scope and message', () => {
    const line = formatEntry({ level: 'error', scope: 'ipc', message: 'scan:start failed', time: AT })
    // Scope is padded to 5, then one space before the message.
    expect(line).toMatch(/^2026-10-19 14:32:07\.421 ERROR ipc {3}scan:start failed$/)
  })

  it('appends detail as JSON', () => {
    const line = formatEntry({
      level: 'error',
      scope: 'ipc',
      message: 'failed',
      detail: { args: [999999], code: 'SQLITE_CONSTRAINT_FOREIGNKEY' },
      time: AT
    })
    expect(line).toContain('{"args":[999999],"code":"SQLITE_CONSTRAINT_FOREIGNKEY"}')
  })

  // One line per entry is what keeps the file greppable and the byte cap real.
  it('collapses a multi-line message onto one line', () => {
    const line = formatEntry({ level: 'warn', scope: 'db', message: 'one\ntwo\r\nthree', time: AT })
    expect(line).not.toContain('\n')
    expect(line).toContain('one two three')
  })

  it('truncates oversized detail', () => {
    const line = formatEntry({ level: 'info', scope: 'app', message: 'big', detail: { blob: 'x'.repeat(5000) }, time: AT })
    expect(line).toContain('…(truncated)')
    expect(line.length).toBeLessThan(2200)
  })

  it('survives circular detail', () => {
    const circular = { name: 'loop' }
    circular.self = circular
    expect(() => formatEntry({ level: 'info', scope: 'app', message: 'x', detail: circular, time: AT })).not.toThrow()
  })

  it('survives a BigInt in detail, which JSON.stringify rejects', () => {
    const line = formatEntry({ level: 'info', scope: 'db', message: 'inserted', detail: { id: 10n }, time: AT })
    expect(line).toContain('"10"')
  })
})

describe('createLogger', () => {
  it('drops entries below the configured level', () => {
    const { lines, logger } = arraySink('info')
    logger.debug('ipc', 'chatty')
    logger.info('app', 'kept')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('kept')
  })

  it('emits every level when set to debug', () => {
    const { lines, logger } = arraySink('debug')
    for (const level of Object.keys(LEVELS)) logger[level]('app', level)
    expect(lines).toHaveLength(4)
  })

  it('setLevel changes the threshold afterwards', () => {
    const { lines, logger } = arraySink('error')
    logger.info('app', 'dropped')
    logger.setLevel('debug')
    logger.info('app', 'kept')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('kept')
  })

  // Requirement: logging must never break the app.
  it('swallows a sink that throws', () => {
    const logger = createLogger({
      write: () => {
        throw new Error('disk full')
      },
      level: 'debug'
    })
    expect(() => logger.error('app', 'boom')).not.toThrow()
    // And it does not latch - a later write still attempts.
    expect(() => logger.error('app', 'again')).not.toThrow()
  })

  // The guarantee that makes redaction unforgettable: scrubbing happens inside
  // the logger, so a call site that passes a raw URL still cannot leak a key.
  it('scrubs a credential a call site failed to redact', () => {
    const { lines, logger } = arraySink('debug')
    logger.warn('tmdb', 'request failed', { url: `https://api.themoviedb.org/3/movie/550?api_key=${KEY}` })
    expect(lines[0]).not.toContain(KEY)
    expect(lines[0]).toContain('api_key=***')
  })

  it('replays a record with its original timestamp', () => {
    const { lines, logger } = arraySink('debug')
    const earlier = new Date('2026-10-19T09:00:00.123')
    logger.emitRecord({ level: 'error', scope: 'probe', message: 'ffprobe missing', time: earlier })
    expect(lines[0]).toContain('2026-10-19 09:00:00.123')
  })
})
