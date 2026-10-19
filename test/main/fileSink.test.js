import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileSink } from '../../src/main/log/fileSink'

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'movielib-log-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createFileSink', () => {
  it('writes lines that can be read back', () => {
    const sink = createFileSink({ dir })
    sink.write('first')
    sink.write('second')

    const text = readFileSync(sink.path, 'utf8')
    expect(text).toContain('first')
    expect(text).toContain('second')
  })

  // Windows 7 Notepad renders a bare-LF file as one long line, and Notepad is
  // what the person sending this log will open it with.
  it('terminates lines with CRLF', () => {
    const sink = createFileSink({ dir })
    sink.write('line')
    expect(readFileSync(sink.path, 'utf8')).toBe('line\r\n')
  })

  it('appends to an existing file rather than truncating it', () => {
    const first = createFileSink({ dir })
    first.write('before restart')

    const second = createFileSink({ dir })
    second.write('after restart')

    const text = readFileSync(second.path, 'utf8')
    expect(text).toContain('before restart')
    expect(text).toContain('after restart')
  })

  it('rotates once the cap is passed and keeps the previous file', () => {
    const sink = createFileSink({ dir, maxBytes: 200 })
    for (let i = 0; i < 40; i++) sink.write(`line ${i} ${'x'.repeat(20)}`)

    const rotated = join(dir, 'movie-library.1.log')
    expect(existsSync(sink.path)).toBe(true)
    expect(existsSync(rotated)).toBe(true)
  })

  it('bounds total bytes on disk at roughly twice the cap', () => {
    const maxBytes = 500
    const sink = createFileSink({ dir, maxBytes })
    for (let i = 0; i < 200; i++) sink.write(`line ${i} ${'y'.repeat(40)}`)

    const total = statSync(sink.path).size + statSync(join(dir, 'movie-library.1.log')).size
    // One line may straddle the boundary, so allow a line's slack.
    expect(total).toBeLessThanOrEqual(maxBytes * 2 + 200)
  })

  it('discards the oldest file when rotating twice', () => {
    const sink = createFileSink({ dir, maxBytes: 120 })
    sink.write(`generation one ${'a'.repeat(120)}`)
    sink.write(`generation two ${'b'.repeat(120)}`)
    sink.write(`generation three ${'c'.repeat(120)}`)

    const everything =
      readFileSync(sink.path, 'utf8') + readFileSync(join(dir, 'movie-library.1.log'), 'utf8')
    expect(everything).toContain('generation three')
    expect(everything).not.toContain('generation one')
  })

  // Requirement: logging must never break the app.
  it('does not throw when the directory cannot be used', () => {
    const sink = createFileSink({ dir: join(dir, 'file-not-a-dir', 'deeper') })
    expect(() => sink.write('swallowed')).not.toThrow()
  })
})
