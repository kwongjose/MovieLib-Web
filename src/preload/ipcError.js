// Electron wraps a handler rejection as
//   Error invoking remote method 'scan:start': Error: Add at least one library folder...
// The renderer displays error.message raw, so a message the main process
// deliberately worded as an instruction arrives looking like a crash report.
// The channel name is not lost - the log records it against every failure.
const REMOTE_PREFIX = /^Error invoking remote method '[^']*':\s*(?:[\w$]*Error:\s*)?/

export function cleanIpcErrorMessage(message) {
  if (typeof message !== 'string') return ''
  return message.replace(REMOTE_PREFIX, '')
}
