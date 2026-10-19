import { readdir } from 'node:fs/promises'
import { log, describeError } from '../log'
import { join, extname } from 'node:path'
import { getDb } from '../db'
import { existingPaths, createMovie } from '../db/movies.repo'
import { listFolders } from '../db/folders.repo'
import { listKeyValues } from '../db/omdbKeys.repo'
import { getTmdbKey, setSetting } from '../db/settings.repo'
import { createKeyPool } from './keyPool'
import { parseFilename } from './parseFilename'
import { TmdbAuthError, TmdbNetworkError } from './tmdbClient'
import { fetchTmdbRecord, mergeOmdbFallbacks } from './buildMovie'
import { fetchByTitle, fetchByImdbId, OmdbRateLimitError, OmdbAuthError } from './omdbClient'
import { probeResolution } from './probeVideo'

// Raised from 4 now that each file costs three HTTP round trips instead of one.
// Each file still runs its calls serially, so this is at most 5 requests in
// flight - far inside TMDB's ~40/sec ceiling.
const CONCURRENCY = 5

// Previously the flush threshold *was* CONCURRENCY, coupling two settings with
// nothing to do with each other: how many files are in flight, and how many
// rows are worth one transaction. Separated so either can move independently.
const FLUSH_BATCH_SIZE = 25

const VIDEO_EXTENSIONS = new Set(['.avi', '.mp4', '.mkv', '.m4v', '.mpg', '.ts'])

// A minimal concurrency-limited task runner, in place of the `p-limit`
// package: p-limit ships ESM-only, and once electron-vite's Rollup build
// externalizes it into the CJS main-process bundle, a static `import
// pLimit from 'p-limit'` resolves to the module namespace object instead
// of the callable default export ("pLimit is not a function") - confirmed
// by actually running a scan, not just a standalone import smoke test.
function createLimiter(concurrency) {
  let active = 0
  const queue = []

  function runNext() {
    if (active >= concurrency || queue.length === 0) return
    active += 1
    const { task, resolve, reject } = queue.shift()
    task()
      .then(resolve, reject)
      .finally(() => {
        active -= 1
        runNext()
      })
  }

  return function limit(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject })
      runNext()
    })
  }
}

async function discoverVideoFiles(rootDir) {
  const results = []

  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      // Skipping rather than failing the whole scan, but never silently: an
      // unreadable watch folder is the single most likely reason a scan
      // reports finding nothing at all.
      log.warn('scan', `could not read ${dir}`, describeError(error))
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath)
      }
    }
  }

  await walk(rootDir)
  return results
}

// Finds video files across all saved folders that aren't in the DB yet -
// shared by the real scan and by scan:findNotImported, same as the
// original app's "Load Files" and "Find Bad Names" both being built on
// top of the same "is this path present" check.
export async function findNewFiles() {
  const db = getDb()
  const folders = listFolders(db)
  const discovered = (await Promise.all(folders.map((f) => discoverVideoFiles(f.path)))).flat()
  const already = existingPaths(db)
  // Deduplicated because saving both "D:/Movies" and "D:/Movies/Action" yields
  // the same file twice, which then trips movies.path UNIQUE and fails the
  // whole write batch rather than just that one row.
  return [...new Set(discovered)].filter((path) => !already.has(path))
}

// Asks OMDb for the one field TMDB does not carry: the IMDb rating. Anything
// else it returns is used only to fill gaps TMDB left.
//
// Unlike the old pipeline this is best-effort. Metadata now comes from TMDB, so
// a spent or invalid OMDb key costs a rating, not the scan - hence returning
// null rather than throwing for anything short of a usable answer.
async function lookupOmdb(pool, movie, failures) {
  for (;;) {
    const key = pool.current()
    if (!key) {
      // The quiet path that makes a rating simply never appear: with no usable
      // key this returns null and the film imports with everything except its
      // IMDb score. Debug rather than warn because it fires once per file -
      // the scan-level warning below is the one that gets noticed.
      log.debug('omdb', `no usable OMDb key - importing ${movie.title} without a rating`)
      return null
    }

    try {
      return movie.imdb_id
        ? await fetchByImdbId(key, movie.imdb_id)
        : await fetchByTitle(key, movie.title, movie.year)
    } catch (error) {
      const isRateLimit = error instanceof OmdbRateLimitError
      const isInvalid = error instanceof OmdbAuthError
      if (!isRateLimit && !isInvalid) {
        // The client already logged the HTTP failure; this records the
        // consequence - this film imports without a rating.
        log.debug('omdb', `no rating for ${movie.title}`, describeError(error))
        return null
      }

      // Neither a spent key nor a rejected one should strand the others, and
      // marking by key identity - rather than "the current one" - keeps
      // concurrent reports of the same failure idempotent.
      if (!failures.has(key)) failures.set(key, isRateLimit ? 'rate-limit' : 'invalid')
      if (!pool.markExhausted(key)) return null
    }
  }
}

// Always partitions new-vs-already-imported by path BEFORE doing any network or
// ffprobe work - there is no separate "full" vs "incremental" mode because of
// that.
export async function runScan(onProgress) {
  const db = getDb()

  const tmdbKey = getTmdbKey(db)
  if (!tmdbKey) throw new Error('Add a TMDB API key in Settings before scanning.')

  const folders = listFolders(db)
  if (!folders.length) throw new Error('Add at least one library folder in Settings before scanning.')

  // Marks the boundary the Library's "Latest Import" filter reads back. Taken
  // from SQLite rather than JS: created_at is written as 'YYYY-MM-DD HH:MM:SS'
  // by datetime('now'), and an ISO string with its 'T' and 'Z' would not
  // string-compare against that. Written only after the checks above pass, so a
  // scan that refuses to start doesn't move the mark.
  setSetting(db, 'last_scan_started_at', db.prepare("SELECT datetime('now') AS t").get().t)

  // No longer fatal when empty: without an OMDb key every film simply imports
  // with no IMDb rating, which beats refusing to import anything at all.
  const pool = createKeyPool(listKeyValues(db))

  // The directory walk can take a while on a large library, and reporting
  // nothing during it left the progress bar sitting at zero looking hung.
  onProgress?.({ phase: 'discovering', current: 0, total: 0, currentFile: null })
  const newFiles = await findNewFiles()
  const total = newFiles.length

  // Info level, so a packaged build still answers "did the scan do anything"
  // without the per-file debug noise.
  log.info('scan', `scan started: ${total} new file(s)`, {
    folders: folders.length,
    omdbKeys: pool.total()
  })

  // Stated once, loudly, because it is silent everywhere else: the scan will
  // succeed, TMDB metadata will be written, and every film will simply have no
  // IMDb rating. That combination reads as "the rating update failed" with
  // nothing anywhere saying why.
  if (!pool.total()) {
    log.warn('scan', 'no OMDb API key configured - films will import with no IMDb rating')
  }

  let processed = 0
  let imported = 0
  let skipped = 0
  let withoutRating = 0
  let stopReason = null // 'tmdb-auth' | 'network' | null
  const keyFailures = new Map() // key -> 'rate-limit' | 'invalid'
  let buffer = []

  // createMovie handles the franchise -> Collection link itself, so the scanner
  // and the single-movie IPC paths cannot drift apart on it.
  const flushBuffer = db.transaction((movies) => {
    for (const movie of movies) createMovie(db, movie)
  })

  function flush() {
    if (!buffer.length) return
    // Detached before the write, not after: when the transaction threw, the old
    // code never reached `buffer = []`, so the same failing batch was retried on
    // every later flush and those rows were lost silently.
    const batch = buffer
    buffer = []
    try {
      flushBuffer(batch)
      imported += batch.length
    } catch (error) {
      log.error('scan', `batch of ${batch.length} failed to write`, describeError(error))
      skipped += batch.length
    }
  }

  const limit = createLimiter(CONCURRENCY)

  const tasks = newFiles.map((filePath) =>
    limit(async () => {
      try {
        if (stopReason) return

        const parsed = parseFilename(filePath)
        const tmdbData = await fetchTmdbRecord(tmdbKey, parsed)

        const omdb = await lookupOmdb(pool, tmdbData, keyFailures)
        const movie = mergeOmdbFallbacks(tmdbData, omdb)
        if (movie.imdb_rating == null) withoutRating += 1

        const resolution = await probeResolution(filePath)

        buffer.push({ ...movie, ...resolution, path: filePath })
        if (buffer.length >= FLUSH_BATCH_SIZE) flush()
      } catch (error) {
        // TMDB is now the sole source of metadata, so a rejected key or a dead
        // connection means every remaining file would fail identically - stop
        // once with one root cause instead of logging a wave of "not found".
        if (error instanceof TmdbAuthError) {
          stopReason = 'tmdb-auth'
        } else if (error instanceof TmdbNetworkError) {
          stopReason = 'network'
        } else {
          // Always say why a file was skipped. A silent counter here once hid a
          // bug where every healthy response was being rejected, and "N skipped"
          // looked indistinguishable from genuine no-match files.
          log.debug('scan', `skipped ${filePath}`, describeError(error))
          skipped += 1
        }
      } finally {
        // Inside finally so files short-circuited by stopReason still advance
        // the counter - otherwise the bar froze below total after a fatal stop
        // and looked like a hang.
        processed += 1
        onProgress?.({ phase: 'scanning', current: processed, total, currentFile: filePath })
      }
    })
  )

  await Promise.all(tasks)
  flush()

  const failureReasons = [...keyFailures.values()]
  const summary = {
    total,
    imported,
    skipped,
    withoutRating,
    stopReason,
    keysTotal: pool.total(),
    keysRateLimited: failureReasons.filter((r) => r === 'rate-limit').length,
    keysInvalid: failureReasons.filter((r) => r === 'invalid').length
  }

  log.info('scan', 'scan finished', summary)
  return summary
}
