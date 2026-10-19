import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerAllIpc } from './ipc'
import { stopTrailerServer } from './trailerServer'
import { initLog, log, describeError } from './log'

const isDev = !app.isPackaged

// Verbosity is an environment variable rather than a Settings toggle: a
// setting would have to be read after getDb() succeeds, and a getDb() failure
// is exactly the thing worth logging.
function startLogging() {
  const level = process.env.MOVIELIB_LOG || (app.isPackaged ? 'info' : 'debug')
  const logFile = initLog({ dir: join(app.getPath('userData'), 'logs'), level })

  // One banner per run. The UTC offset lives here so individual lines can stay
  // in plain local time, which is how the reader thinks about "when I clicked".
  log.info('app', `${app.getName()} ${app.getVersion()} started`, {
    electron: process.versions.electron,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    packaged: app.isPackaged,
    level,
    tzOffsetMinutes: -new Date().getTimezoneOffset(),
    logFile
  })

  // An unhandled rejection in a scan path currently vanishes without trace in
  // a packaged build. Note this also changes Node's default behaviour for them
  // from crashing the process to logging and carrying on.
  process.on('unhandledRejection', (reason) => {
    log.error('app', 'unhandled promise rejection', describeError(reason))
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Two Electron instances holding the same SQLite file open is a real
// corruption/locking risk, so only ever allow one running instance.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existingWindow = BrowserWindow.getAllWindows()[0]
    if (existingWindow) {
      if (existingWindow.isMinimized()) existingWindow.restore()
      existingWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // First, so anything registered below can log - including failures during
    // registration itself. Entries from module-evaluation time (probeVideo's
    // missing-ffprobe check) were buffered and are flushed by this call.
    startLogging()

    registerAllIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // The trailer server only exists if a trailer was actually played; closing it
  // on quit keeps the socket from outliving the window on platforms where the
  // process lingers.
  app.on('will-quit', stopTrailerServer)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
