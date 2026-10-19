// Turns a caught error and a set of IPC arguments into something small enough
// to sit on one log line and safe enough to write to disk.

// Channels whose arguments ARE the credential. Their arguments are never
// logged, not even truncated - a prefix of a key is still a disclosure.
export const SENSITIVE_CHANNELS = new Set([
  'settings:setTmdbKey',
  'settings:testTmdbKey',
  'omdbKeys:add'
])

const ARG_STRING_LIMIT = 80

// The whole stack would break the one-line-per-entry rule that makes the file
// greppable and the size cap meaningful. The first frame is the part that says
// where the throw came from, which is all that is needed to go and look.
function firstFrame(stack) {
  if (typeof stack !== 'string') return null
  return (
    stack
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ')) ?? null
  )
}

// `code` is what makes a DB failure actionable - SqliteError carries
// SQLITE_CONSTRAINT_FOREIGNKEY, SQLITE_BUSY and friends, and fs errors carry
// ENOENT/EBUSY/EPERM/EACCES, which the rename path already branches on.
export function describeError(error) {
  if (error === null || error === undefined) {
    return { error: 'Unknown', message: String(error) }
  }
  if (typeof error !== 'object') {
    return { error: typeof error, message: String(error) }
  }

  // Whichever of the two is more specific wins. An explicitly set `name` is a
  // deliberate label and comes first (better-sqlite3 sets 'SqliteError'), but
  // the typed errors here - TmdbAuthError, OmdbRateLimitError and friends -
  // are `class X extends Error {}` with no name of their own, so they inherit
  // 'Error' and only the constructor says which failure this actually was.
  const className = error.constructor?.name
  const described = {
    error:
      error.name && error.name !== 'Error'
        ? error.name
        : className && className !== 'Object'
          ? className
          : 'Error',
    message: String(error.message ?? '')
  }
  if (error.code !== undefined && error.code !== null) described.code = String(error.code)

  const frame = firstFrame(error.stack)
  if (frame) described.at = frame

  return described
}

function summarizeValue(value) {
  if (value === null) return null
  if (Array.isArray(value)) return `Array(${value.length})`

  switch (typeof value) {
    case 'number':
    case 'boolean':
      return value
    case 'undefined':
      return 'undefined'
    case 'string':
      return value.length > ARG_STRING_LIMIT ? `${value.slice(0, ARG_STRING_LIMIT)}…` : value
    case 'object':
      return `{${Object.keys(value).join(',')}}`
    default:
      return typeof value
  }
}

// Values, not types: knowing a refetch failed for movie 999999 is the whole
// point. Strings are capped because a plot or a path should not be able to
// push the rest of the line past the detail limit.
export function summarizeArgs(channel, args) {
  if (SENSITIVE_CHANNELS.has(channel)) return '<redacted>'
  return (args ?? []).map(summarizeValue)
}
