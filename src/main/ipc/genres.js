import { handle } from './handle'
import { getDb } from '../db'
import { listGenres, addGenre, removeGenre } from '../db/genres.repo'

export function registerGenresIpc() {
  handle('genres:list', () => listGenres(getDb()))
  handle('genres:add', (_e, name) => addGenre(getDb(), name))
  handle('genres:remove', (_e, name) => {
    removeGenre(getDb(), name)
    return { ok: true }
  })
}
