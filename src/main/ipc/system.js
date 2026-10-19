import { shell } from 'electron'
import { handle } from './handle'
import { getDb } from '../db'
import { getTrailerBase } from '../trailerServer'
import { getLogFilePath } from '../log'

export function registerSystemIpc() {
  handle('system:openFile', (_e, path) => shell.openPath(path))
  handle('system:openContainingFolder', (_e, path) => {
    shell.showItemInFolder(path)
    return { ok: true }
  })
  handle('system:revealDatabaseFile', () => {
    shell.showItemInFolder(getDb().name)
    return { ok: true }
  })

  // Reveal rather than open: the point is to send the file to whoever is
  // diagnosing the problem, and showItemInFolder leaves it selected in
  // Explorer ready to be attached.
  handle('system:revealLogFile', () => {
    const path = getLogFilePath()
    if (!path) throw new Error('No log file has been created yet.')
    shell.showItemInFolder(path)
    return { ok: true }
  })

  // Origin + token for the loopback page that hosts the trailer embed. Starting
  // the server is what this call triggers, so a library that never plays a
  // trailer never opens a socket.
  handle('system:getTrailerBase', () => getTrailerBase())

  // Restricted to https so this can never be turned into "open anything on this
  // machine" - shell.openExternal will happily launch file:// URLs otherwise.
  handle('system:openExternal', (_e, url) => {
    if (!/^https:\/\//i.test(String(url ?? ''))) throw new Error('Only https links can be opened.')
    shell.openExternal(url)
    return { ok: true }
  })
}
