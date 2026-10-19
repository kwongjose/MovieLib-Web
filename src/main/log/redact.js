// Keeps API credentials out of the log file. The log is meant to be emailed to
// whoever is fixing a problem, so a key reaching it is a key disclosed.
//
// Credentials only ever leave this app in three shapes: a query-string
// parameter (TMDB's api_key, OMDb's apikey), an Authorization header carrying
// a bearer token, or a bare TMDB v4 read token, which is a JWT. Covering those
// three covers every way a key can reach a line.

export const REDACTED = '***'

const SECRET_PARAM = /([?&](?:api_key|apikey|key|token|access_token|session_id)=)[^&#\s"']*/gi
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const JWT = /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

// Deliberately no "looks like a 32-char hex string" rule. A TMDB v3 key is 32
// hex characters, but nothing else logged here is - while tmdb_id, imdb_id,
// runtimes and resolutions are full of digits a loose rule would mangle. A key
// cannot reach a line except through the three shapes above.
export function redactUrl(value) {
  if (typeof value !== 'string') return ''
  return value.replace(SECRET_PARAM, `$1${REDACTED}`)
}

// Applied by the logger to every fully assembled line, rather than trusted to
// call sites: redaction you can forget to apply is redaction that leaks.
export function scrubLine(line) {
  if (typeof line !== 'string') return ''
  return line
    .replace(SECRET_PARAM, `$1${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
}
