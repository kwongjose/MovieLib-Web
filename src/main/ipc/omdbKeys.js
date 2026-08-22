import { ipcMain } from 'electron'
import { getDb } from '../db'
import { listKeys, addKey, removeKey } from '../db/omdbKeys.repo'

export function registerOmdbKeysIpc() {
  ipcMain.handle('omdbKeys:list', () => listKeys(getDb()))
  ipcMain.handle('omdbKeys:add', (_e, key) => addKey(getDb(), key))
  ipcMain.handle('omdbKeys:remove', (_e, id) => {
    removeKey(getDb(), id)
    return { ok: true }
  })
}
