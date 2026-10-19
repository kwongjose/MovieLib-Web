import { migrateCollectionNameSuffix } from './collections.repo'
import { log } from '../log'

const DEFAULT_GENRES = [
  'Action',
  'Animation',
  'Adventure',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Film-Noir',
  'History',
  'Horror',
  'Music',
  'Marvel',
  'DC',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
  'Western'
]

const SCHEMA_VERSION = '2'

const CREATE_STATEMENTS = `
CREATE TABLE IF NOT EXISTS movies (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  year              TEXT,
  rated             TEXT,
  imdb_rating       REAL,
  imdb_id           TEXT,
  tmdb_id           INTEGER,
  -- A TMDB id is only unique within a media type - movie 1396 and TV 1396 are
  -- different titles - so the type has to travel with the id. Only 'movie' is
  -- written today; the column exists so adding TV later isn't a schema change.
  tmdb_media_type   TEXT NOT NULL DEFAULT 'movie',
  -- trailer_checked_at distinguishes "looked, found nothing" from "never
  -- looked", which a null trailer_key alone can't express.
  trailer_key       TEXT,
  trailer_site      TEXT,
  trailer_checked_at TEXT,
  runtime_minutes   INTEGER,
  runtime_label     TEXT,
  width             INTEGER,
  height            INTEGER,
  resolution_label  TEXT,
  plot              TEXT,
  path              TEXT NOT NULL UNIQUE,
  poster_url        TEXT,
  last_watched_at   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_movies_year        ON movies(year);
CREATE INDEX IF NOT EXISTS idx_movies_imdb_rating ON movies(imdb_rating);
CREATE INDEX IF NOT EXISTS idx_movies_watched     ON movies(last_watched_at);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id     ON movies(tmdb_id);

CREATE TABLE IF NOT EXISTS actors (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS movie_actors (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  -- Billing position from TMDB's cast order. Without it the cast can only be
  -- listed alphabetically, which buries the lead - "Ana de Armas, Dave
  -- Bautista, Harrison Ford" instead of "Ryan Gosling, Harrison Ford".
  -- NULL for hand-added actors, which sort last by name.
  billing_order INTEGER,
  PRIMARY KEY (movie_id, actor_id)
);
CREATE INDEX IF NOT EXISTS idx_movie_actors_actor ON movie_actors(actor_id);

CREATE TABLE IF NOT EXISTS genres (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_movie_genres_genre ON movie_genres(genre_id);

CREATE TABLE IF NOT EXISTS collections (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS movie_collections (
  movie_id      INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_movie_collections_collection ON movie_collections(collection_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Several OMDb keys can be held at once; the importer moves to the next when
-- one hits its daily limit. Ordered by id, so the list is used top-down.
CREATE TABLE IF NOT EXISTS omdb_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watch_folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Deliberately NOT contentless (no content=''): a contentless FTS5 table
-- can't be plain DELETEd/SELECTed once populated (SQLite requires the old
-- column values to unindex a row, which content='' has nowhere to store).
-- A self-contained table duplicates a little text into the FTS shadow
-- tables, which is irrelevant overhead for a personal movie library, and
-- in exchange every operation is just ordinary INSERT/UPDATE/DELETE by rowid.
CREATE VIRTUAL TABLE IF NOT EXISTS movies_fts USING fts5(
  title,
  actor_names,
  tokenize='trigram'
);
`

export function applySchema(db) {
  resetLegacyMovieTables(db)
  db.exec(CREATE_STATEMENTS)
  seedGenres(db)
  migrateSingleApiKey(db)
  // After CREATE_STATEMENTS - the collections table has to exist first.
  migrateCollectionNameSuffix(db)
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION)
}

// Moving to TMDB added columns to `movies`, and CREATE TABLE IF NOT EXISTS
// silently does nothing when the table already exists - so a pre-TMDB database
// would survive startup and then fail with "no such column: tmdb_id" on the
// first query. The library is meant to be rebuilt from scratch anyway, so drop
// the movie data and let CREATE_STATEMENTS rebuild it.
//
// Deliberately narrow: genres, collections, settings, omdb_keys and
// watch_folders are left alone, so API keys, library folders and hand-made
// collections all survive the reset. Only rows that have to be re-imported go.
function resetLegacyMovieTables(db) {
  const moviesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'movies'")
    .get()
  if (!moviesTable) return

  // Both tables gained columns in the TMDB change, so both are checked - a
  // database left half-upgraded by an in-progress build would otherwise pass
  // the movies check and then fail on movie_actors.billing_order instead.
  const hasTmdbId = db
    .prepare('PRAGMA table_info(movies)')
    .all()
    .some((column) => column.name === 'tmdb_id')
  const hasBillingOrder = db
    .prepare('PRAGMA table_info(movie_actors)')
    .all()
    .some((column) => column.name === 'billing_order')
  if (hasTmdbId && hasBillingOrder) return

  // foreign_keys can't be toggled inside a transaction, and the junction tables
  // reference movies, so drop children first with enforcement off.
  db.pragma('foreign_keys = OFF')
  try {
    db.exec(`
      DROP TABLE IF EXISTS movies_fts;
      DROP TABLE IF EXISTS movie_actors;
      DROP TABLE IF EXISTS movie_genres;
      DROP TABLE IF EXISTS movie_collections;
      DROP TABLE IF EXISTS movies;
      DROP TABLE IF EXISTS actors;
    `)
  } finally {
    db.pragma('foreign_keys = ON')
  }
  log.info('db', 'pre-TMDB library detected - movie tables reset; keys, folders and collections kept')
}

// The API key used to be a single settings row. Carry any existing one into
// the new table so upgrading doesn't silently lose it and leave scanning
// broken with no obvious cause.
function migrateSingleApiKey(db) {
  const existingCount = db.prepare('SELECT COUNT(*) AS c FROM omdb_keys').get().c
  if (existingCount > 0) return

  const legacy = db.prepare("SELECT value FROM settings WHERE key = 'omdb_api_key'").get()
  if (legacy?.value) {
    db.prepare('INSERT OR IGNORE INTO omdb_keys (key) VALUES (?)').run(legacy.value.trim())
  }
}

function seedGenres(db) {
  const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)')
  const seedAll = db.transaction((genres) => {
    for (const genre of genres) insertGenre.run(genre)
  })
  seedAll(DEFAULT_GENRES)
}

export { DEFAULT_GENRES, SCHEMA_VERSION }
