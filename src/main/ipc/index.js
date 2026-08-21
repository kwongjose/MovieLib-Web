import { registerMoviesIpc } from './movies'
import { registerGenresIpc } from './genres'
import { registerCollectionsIpc } from './collections'
import { registerSettingsIpc } from './settings'
import { registerFoldersIpc } from './folders'
import { registerSystemIpc } from './system'
import { registerScanIpc } from './scan'
import { registerDevIpc } from './dev'

export function registerAllIpc() {
  registerMoviesIpc()
  registerGenresIpc()
  registerCollectionsIpc()
  registerSettingsIpc()
  registerFoldersIpc()
  registerSystemIpc()
  registerScanIpc()
  registerDevIpc()
}
