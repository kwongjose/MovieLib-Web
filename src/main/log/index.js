import { createLogger } from './logger'
import { createFileSink } from './fileSink'

// This module and everything it imports must stay free of `electron`.
// schema.js and collections.repo.js log, and both are directly unit-tested
// against an in-memory database; an `import { app } from 'electron'` anywhere
// in this chain would break those tests. The userData directory is therefore
// injected by initLog rather than looked up here.

// ESM imports are evaluated before any statement in main/index.js runs, so a
// module that logs at evaluation time (probeVideo.js, when ffprobe is missing)
// logs before there is anywhere to write. Those entries are held and replayed.
const BUFFER_LIMIT = 200

let active = null
let buffered = []
let logFilePath = null

function record(level, scope, message, detail) {
  const entry = { level, scope, message, detail, time: new Date() }
  if (active) {
    active.emitRecord(entry)
    return
  }
  if (buffered.length < BUFFER_LIMIT) buffered.push(entry)
}

export const log = {
  error: (scope, message, detail) => record('error', scope, message, detail),
  warn: (scope, message, detail) => record('warn', scope, message, detail),
  info: (scope, message, detail) => record('info', scope, message, detail),
  debug: (scope, message, detail) => record('debug', scope, message, detail)
}

export function initLog({ dir, level }) {
  const sink = createFileSink({ dir })
  logFilePath = sink.path
  active = createLogger({ write: sink.write, level })

  for (const entry of buffered) active.emitRecord(entry)
  buffered = []

  return logFilePath
}

// Null until initLog runs - the reveal-log IPC handler reports that rather
// than pointing Explorer at nothing.
export function getLogFilePath() {
  return logFilePath
}

export function setLogLevel(level) {
  active?.setLevel(level)
}

// Re-exported so call sites need one import to log an error properly.
export { describeError } from './describe'
