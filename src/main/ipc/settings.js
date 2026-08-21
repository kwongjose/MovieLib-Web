import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getSettings, setSettings } from '../db/settings.repo'

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => getSettings(getDb()))
  ipcMain.handle('settings:set', (_e, payload) => setSettings(getDb(), payload))
}
