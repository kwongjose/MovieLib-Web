import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { getDb } from '../db'
import { existingPaths, createMovie } from '../db/movies.repo'
import { listFolders } from '../db/folders.repo'
import { getSettings } from '../db/settings.repo'
import { parseFilename } from './parseFilename'
import {
  fetchByTitle,
  fetchByImdbId,
  OmdbRateLimitError,
  OmdbAuthError,
  OmdbNetworkError,
  OmdbNotFoundError
} from './omdbClient'
import { probeResolution } from './probeVideo'

const CONCURRENCY = 4
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
    } catch {
      return // folder no longer exists / unreadable - skip it, don't fail the whole scan
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
  return discovered.filter((path) => !already.has(path))
}

// A year taken from the filename that disagrees with OMDb's (release vs.
// production year, a re-release, or simply a wrong year in the name) turns
// an otherwise-findable film into a miss, since OMDb treats `y` as an exact
// filter. Retry on the title alone before giving up. This goes beyond the
// original app, which had no such fallback; the extra request only happens
// for a file that has already failed.
async function lookupMovie(apiKey, parsed) {
  if (parsed.imdbId) return fetchByImdbId(apiKey, parsed.imdbId)

  try {
    return await fetchByTitle(apiKey, parsed.title, parsed.year)
  } catch (error) {
    if (parsed.year && error instanceof OmdbNotFoundError) {
      return fetchByTitle(apiKey, parsed.title, null)
    }
    throw error
  }
}

// Always partitions new-vs-already-imported by path BEFORE doing any
// OMDb/ffprobe work (see the plan's "Note on scan modes") - there is no
// separate "full" vs "incremental" mode because of that.
export async function runScan(onProgress) {
  const db = getDb()
  const { omdbApiKey } = getSettings(db)
  if (!omdbApiKey) throw new Error('Set an OMDb API key in Settings before scanning.')

  const folders = listFolders(db)
  if (!folders.length) throw new Error('Add at least one library folder in Settings before scanning.')

  const newFiles = await findNewFiles()
  const total = newFiles.length

  let processed = 0
  let imported = 0
  let skipped = 0
  let stopReason = null // 'rate-limit' | 'invalid-key' | 'network' | null
  let buffer = []

  const flushBuffer = db.transaction((movies) => {
    for (const movie of movies) createMovie(db, movie)
  })

  function flush() {
    if (!buffer.length) return
    flushBuffer(buffer)
    imported += buffer.length
    buffer = []
  }

  const limit = createLimiter(CONCURRENCY)

  const tasks = newFiles.map((filePath) =>
    limit(async () => {
      if (stopReason) return

      const parsed = parseFilename(filePath)

      try {
        const omdbData = await lookupMovie(omdbApiKey, parsed)

        const resolution = await probeResolution(filePath)

        buffer.push({ ...omdbData, ...resolution, path: filePath })
        if (buffer.length >= CONCURRENCY) flush()
      } catch (error) {
        // Rate-limit and invalid-key both mean every remaining file would
        // fail identically - stop cleanly instead of marking each as
        // "skipped" one by one, which would misleadingly look like a wave
        // of not-found titles rather than one root cause.
        if (error instanceof OmdbRateLimitError) {
          stopReason = 'rate-limit'
        } else if (error instanceof OmdbAuthError) {
          stopReason = 'invalid-key'
        } else if (error instanceof OmdbNetworkError) {
          stopReason = 'network'
        } else {
          // Always say why a file was skipped. A silent counter here once hid
          // a bug where every healthy OMDb response was being rejected, and
          // "N skipped" looked indistinguishable from genuine no-match files.
          console.warn(`[scan] skipped ${filePath}: ${error.message}`)
          skipped += 1
        }
      } finally {
        processed += 1
        onProgress?.({ phase: 'scanning', current: processed, total, currentFile: filePath })
      }
    })
  )

  await Promise.all(tasks)
  flush()

  return { total, imported, skipped, stopReason }
}
