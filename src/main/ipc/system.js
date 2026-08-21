import { ipcMain, shell } from 'electron'
import { getDb } from '../db'

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
}
