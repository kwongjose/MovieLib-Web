import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const TWO_MB = 2 * 1024 * 1024

// Writes are synchronous on purpose. A buffered stream loses precisely the
// lines this exists for - the ones written just before the process died.
// At this volume (failures, plus one line per user action) that is cheap.
export function createFileSink({
  dir,
  fileName = 'movie-library.log',
  rotatedName = 'movie-library.1.log',
  maxBytes = TWO_MB
}) {
  const path = join(dir, fileName)
  const rotatedPath = join(dir, rotatedName)

  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // A log directory that cannot be created costs logging, not the app.
  }

  // Seeded once and tracked in memory so there is no stat() per line.
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    size = 0
  }

  function rotate() {
    try {
      unlinkSync(rotatedPath)
    } catch {
      // Nothing to discard on the first rotation.
    }
    try {
      renameSync(path, rotatedPath)
      size = 0
    } catch {
      // If the rename fails the file simply keeps growing past the cap, which
      // beats losing the lines.
    }
  }

  function write(line) {
    // CRLF, not LF: Windows 7 Notepad renders a bare LF file as one long line,
    // and Notepad is what the person asked to send this will open it with.
    const payload = `${line}\r\n`
    if (size >= maxBytes) rotate()

    try {
      appendFileSync(path, payload)
      size += Buffer.byteLength(payload)
    } catch {
      // Never break the app for a log write.
    }
  }

  return { write, path }
}
