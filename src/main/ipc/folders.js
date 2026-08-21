import { ipcMain, BrowserWindow, dialog } from 'electron'
import { getDb } from '../db'
import { listFolders, addFolder, removeFolder } from '../db/folders.repo'

export function registerFoldersIpc() {
  ipcMain.handle('folders:list', () => listFolders(getDb()))

  ipcMain.handle('folders:add', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return addFolder(getDb(), result.filePaths[0])
  })

  ipcMain.handle('folders:remove', (_e, id) => {
    removeFolder(getDb(), id)
    return { ok: true }
  })
}
