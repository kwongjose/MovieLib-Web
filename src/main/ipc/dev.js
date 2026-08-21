import { ipcMain, app } from 'electron'
import { getDb } from '../db'
import { createMovie, resetLibrary } from '../db/movies.repo'

// Dev-only: lets the Library UI be built and tested (Phase 3) before the
// real importer exists (Phase 4). Never registered in a packaged build.
const FAKE_MOVIES = [
  {
    title: 'The Great Escape',
    year: '1963',
    imdb_rating: 8.2,
    runtime_minutes: 172,
    runtime_label: '172 min',
    width: 1920,
    height: 1080,
    resolution_label: '1920 x 1080',
    path: 'C:/fake/The Great Escape (1963).mkv',
    genreNames: ['Adventure', 'War'],
    actorNames: ['Steve McQueen', 'James Garner']
  },
  {
    title: 'Galaxy Raiders',
    year: '1999',
    imdb_rating: 6.4,
    runtime_minutes: 118,
    runtime_label: '118 min',
    width: 1280,
    height: 720,
    resolution_label: '1280 x 720',
    path: 'C:/fake/Galaxy Raiders (1999).mkv',
    genreNames: ['Sci-Fi', 'Action'],
    actorNames: ['Ana Rossi', 'Sam Fields']
  },
  {
    title: 'Laugh Track',
    year: '2005',
    imdb_rating: 5.8,
    runtime_minutes: 95,
    runtime_label: '95 min',
    width: 720,
    height: 480,
    resolution_label: '720 x 480',
    path: 'C:/fake/Laugh Track (2005).mkv',
    genreNames: ['Comedy'],
    actorNames: ['Sam Fields']
  },
  {
    title: 'Marvel Test: Origins',
    year: '2012',
    imdb_rating: 7.9,
    runtime_minutes: 130,
    runtime_label: '130 min',
    width: 1920,
    height: 1080,
    resolution_label: '1920 x 1080',
    path: 'C:/fake/Marvel Test Origins (2012).mkv',
    genreNames: ['Marvel', 'Action'],
    actorNames: ['Ana Rossi']
  },
  {
    title: 'Midnight Horror House',
    year: '1988',
    imdb_rating: 6.9,
    runtime_minutes: 88,
    runtime_label: '88 min',
    width: 720,
    height: 576,
    resolution_label: '720 x 576',
    path: 'C:/fake/Midnight Horror House (1988).mkv',
    genreNames: ['Horror'],
    actorNames: ['James Garner']
  }
]

export function registerDevIpc() {
  if (app.isPackaged) return

  ipcMain.handle('dev:seedFakeMovies', () => {
    const db = getDb()
    resetLibrary(db)
    for (const movie of FAKE_MOVIES) createMovie(db, movie)
    return { seeded: FAKE_MOVIES.length }
  })
}
