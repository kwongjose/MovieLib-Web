import { handle } from './handle'
import { getDb } from '../db'
import { getTmdbKey, setTmdbKey } from '../db/settings.repo'
import { verifyCredential } from '../importer/tmdbClient'

export function registerSettingsIpc() {
  handle('settings:getTmdbKey', () => getTmdbKey(getDb()))
  handle('settings:setTmdbKey', (_e, key) => {
    setTmdbKey(getDb(), key)
    return { ok: true }
  })

  // A bad TMDB key now stops an entire scan, where a bad OMDb key used to be
  // survivable - so it is worth being able to find out before scanning rather
  // than three minutes into one.
  handle('settings:testTmdbKey', async (_e, key) => {
    const candidate = (key ?? '').trim() || getTmdbKey(getDb())
    if (!candidate) return { ok: false, message: 'No TMDB key set.' }

    try {
      await verifyCredential(candidate)
      return { ok: true, message: 'Key works.' }
    } catch (error) {
      return { ok: false, message: error.message }
    }
  })
}
