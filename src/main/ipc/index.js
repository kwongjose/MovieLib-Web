import { registerMoviesIpc } from './movies'
import { registerGenresIpc } from './genres'
import { registerCollectionsIpc } from './collections'
import { registerSettingsIpc } from './settings'
import { registerFoldersIpc } from './folders'
import { registerSystemIpc } from './system'

// scan.js is registered separately, once importer/scanner.js exists (Phase 4).
export function registerAllIpc() {
  registerMoviesIpc()
  registerGenresIpc()
  registerCollectionsIpc()
  registerSettingsIpc()
  registerFoldersIpc()
  registerSystemIpc()
}
