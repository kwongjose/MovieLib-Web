import { registerMoviesIpc } from './movies'
import { registerGenresIpc } from './genres'
import { registerCollectionsIpc } from './collections'
import { registerOmdbKeysIpc } from './omdbKeys'
import { registerFoldersIpc } from './folders'
import { registerSystemIpc } from './system'
import { registerScanIpc } from './scan'
import { registerDevIpc } from './dev'

export function registerAllIpc() {
  registerMoviesIpc()
  registerGenresIpc()
  registerCollectionsIpc()
  registerOmdbKeysIpc()
  registerFoldersIpc()
  registerSystemIpc()
  registerScanIpc()
  registerDevIpc()
}
