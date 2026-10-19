import { ipcMain } from 'electron'
import { log, describeError } from '../log'
import { summarizeArgs } from '../log/describe'

// Every channel registers through here rather than calling ipcMain.handle
// directly, so a handler cannot be added later that fails invisibly. There is
// a grep in the README guarding that: ipcMain.handle should appear in this
// file and nowhere else.
//
// The handler is awaited rather than returned. ipcMain.handle already resolves
// a returned promise and the renderer always awaits invoke(), so wrapping a
// synchronous handler in async changes nothing a caller can observe - and it
// is the only way to catch a rejection from the async handlers in the same
// place as a throw from the synchronous ones.
export function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    const startedAt = Date.now()
    try {
      const result = await handler(event, ...args)
      // Debug-level, so it is off in packaged builds by default. It is the
      // only way to tell a handler that hung from one that threw.
      log.debug('ipc', `${channel} ok in ${Date.now() - startedAt} ms`)
      return result
    } catch (error) {
      log.error('ipc', `${channel} failed after ${Date.now() - startedAt} ms`, {
        args: summarizeArgs(channel, args),
        ...describeError(error)
      })
      // Rethrown unchanged: the message the renderer shows must not move.
      throw error
    }
  })
}
