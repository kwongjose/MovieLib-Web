import { ipcMain } from 'electron'
import { getDb } from '../db'
import { listGenres, addGenre, removeGenre } from '../db/genres.repo'

export function registerGenresIpc() {
  ipcMain.handle('genres:list', () => listGenres(getDb()))
  ipcMain.handle('genres:add', (_e, name) => addGenre(getDb(), name))
  ipcMain.handle('genres:remove', (_e, name) => {
    removeGenre(getDb(), name)
    return { ok: true }
  })
}
