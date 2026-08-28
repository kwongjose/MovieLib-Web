import { ipcMain } from 'electron'
import { runScan, findNewFiles } from '../importer/scanner'

let scanning = false

// Renaming a file mid-scan would let the scanner re-import it as a new row
// (discovery works from a snapshot of existing paths), so rename refuses
// while this is true.
export function isScanning() {
  return scanning
}

export function registerScanIpc() {
  ipcMain.handle('scan:start', async (event) => {
    if (scanning) throw new Error('A scan is already running.')
    scanning = true
    const sender = event.sender
    try {
      return await runScan((progress) => {
        if (!sender.isDestroyed()) sender.send('scan:progress', progress)
      })
    } finally {
      scanning = false
    }
  })

  ipcMain.handle('scan:findNotImported', () => findNewFiles())
}
