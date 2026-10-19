import { BrowserWindow, dialog } from 'electron'
import { handle } from './handle'
import { getDb } from '../db'
import { listFolders, addFolder, removeFolder } from '../db/folders.repo'

export function registerFoldersIpc() {
  handle('folders:list', () => listFolders(getDb()))

  handle('folders:add', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return addFolder(getDb(), result.filePaths[0])
  })

  handle('folders:remove', (_e, id) => {
    removeFolder(getDb(), id)
    return { ok: true }
  })
}
