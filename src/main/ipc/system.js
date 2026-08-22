import { ipcMain, shell } from 'electron'
import { getDb } from '../db'
import { getTrailerBase } from '../trailerServer'

export function registerSystemIpc() {
  ipcMain.handle('system:openFile', (_e, path) => shell.openPath(path))
  ipcMain.handle('system:openContainingFolder', (_e, path) => {
    shell.showItemInFolder(path)
    return { ok: true }
  })
  ipcMain.handle('system:revealDatabaseFile', () => {
    shell.showItemInFolder(getDb().name)
    return { ok: true }
  })

  // Origin + token for the loopback page that hosts the trailer embed. Starting
  // the server is what this call triggers, so a library that never plays a
  // trailer never opens a socket.
  ipcMain.handle('system:getTrailerBase', () => getTrailerBase())

  // Restricted to https so this can never be turned into "open anything on this
  // machine" - shell.openExternal will happily launch file:// URLs otherwise.
  ipcMain.handle('system:openExternal', (_e, url) => {
    if (!/^https:\/\//i.test(String(url ?? ''))) throw new Error('Only https links can be opened.')
    shell.openExternal(url)
    return { ok: true }
  })
}
