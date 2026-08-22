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

const SCHEMA_VERSION = '1'

const CREATE_STATEMENTS = `
CREATE TABLE IF NOT EXISTS movies (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  year              TEXT,
  rated             TEXT,
  imdb_rating       REAL,
  imdb_id           TEXT,
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

CREATE TABLE IF NOT EXISTS actors (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS movie_actors (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
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
  db.exec(CREATE_STATEMENTS)
  seedGenres(db)
  migrateSingleApiKey(db)
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION)
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
