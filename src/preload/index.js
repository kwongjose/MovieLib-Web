import { contextBridge } from 'electron'

// Populated incrementally as IPC handlers are added in src/main/ipc/*.js.
// Never expose a raw ipcRenderer.invoke passthrough here - only named,
// whitelisted methods so the renderer can't invoke arbitrary channels.
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
