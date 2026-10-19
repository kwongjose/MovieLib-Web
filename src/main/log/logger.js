import { scrubLine } from './redact'

export const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

// One pathological argument - a 900-entry array, a plot field - must not be
// able to eat the rotation budget on its own.
const DETAIL_LIMIT = 2000

const pad = (value, width) => String(value).padStart(width, '0')

// Local time, and no per-line UTC offset: the person reading this correlates
// it against "I clicked it around half two". The offset goes in the startup
// banner once, where it is still recoverable.
function timestamp(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)} ` +
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.` +
    `${pad(date.getMilliseconds(), 3)}`
  )
}

// Every entry is exactly one line. That is what keeps the file greppable and
// the byte cap honest, and it is why only one stack frame is ever logged.
const oneLine = (value) => String(value ?? '').replace(/\r?\n/g, ' ')

function stringifyDetail(detail) {
  if (detail === undefined || detail === null) return ''

  let text
  try {
    // better-sqlite3 can hand back a BigInt lastInsertRowid, which
    // JSON.stringify throws on; circular objects throw too.
    text = JSON.stringify(detail, (_key, value) => (typeof value === 'bigint' ? String(value) : value))
  } catch {
    return '"[unserializable detail]"'
  }
  if (text === undefined) return ''

  text = oneLine(text)
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…(truncated)` : text
}

export function formatEntry({ level, scope, message, detail, time }) {
  const head = `${timestamp(time)} ${String(level).toUpperCase().padEnd(5)} ${String(scope).padEnd(5)} ${oneLine(message)}`
  const tail = stringifyDetail(detail)
  // Scrubbed here, at the single point every line passes through.
  return scrubLine(tail ? `${head} ${tail}` : head)
}

export function createLogger({ write, level = 'info', now = () => new Date() }) {
  let threshold = LEVELS[level] ?? LEVELS.info

  // Public so initLog can replay entries buffered before the log file existed,
  // keeping each one's original timestamp rather than the time of the replay.
  function emitRecord(record) {
    if ((LEVELS[record.level] ?? LEVELS.info) > threshold) return

    let line
    try {
      line = formatEntry(record)
    } catch {
      return
    }
    try {
      write(line)
    } catch {
      // Logging must never break the app, and there is no latch: a transient
      // antivirus lock on the file should cost one line, not the session.
    }
  }

  const emit = (level, scope, message, detail) =>
    emitRecord({ level, scope, message, detail, time: now() })

  return {
    error: (scope, message, detail) => emit('error', scope, message, detail),
    warn: (scope, message, detail) => emit('warn', scope, message, detail),
    info: (scope, message, detail) => emit('info', scope, message, detail),
    debug: (scope, message, detail) => emit('debug', scope, message, detail),
    emitRecord,
    setLevel: (next) => {
      if (LEVELS[next] !== undefined) threshold = LEVELS[next]
    },
    getLevel: () => Object.keys(LEVELS).find((name) => LEVELS[name] === threshold)
  }
}
