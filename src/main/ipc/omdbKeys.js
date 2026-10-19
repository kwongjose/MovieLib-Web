import { handle } from './handle'
import { getDb } from '../db'
import { listKeys, addKey, removeKey } from '../db/omdbKeys.repo'

export function registerOmdbKeysIpc() {
  handle('omdbKeys:list', () => listKeys(getDb()))
  handle('omdbKeys:add', (_e, key) => addKey(getDb(), key))
  handle('omdbKeys:remove', (_e, id) => {
    removeKey(getDb(), id)
    return { ok: true }
  })
}
