// Deliberately free of any electron import: this module is pure mapping, so it
// can be exercised against recorded TMDB payloads without an Electron runtime.

// Hardcoded rather than read from /configuration on every launch: the image
// base has been stable for the life of the v3 API, and fetching it would cost a
// request per session to learn a constant.
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'

// The detail dialog is the only place a poster renders, at 180x266 CSS px, so
// w342 is already ~2x display size. w500 is 86 KB against w342's 39 KB - more
// than double the bytes for pixels that never reach the screen.
const POSTER_SIZE = 'w342'

// TMDB's vocabulary vs. the genre list this app already seeds and filters on.
// Only one name actually differs; mapping it keeps the Genre filter stable
// instead of silently splitting Sci-Fi across two entries.
export const GENRE_ALIASES = { 'Science Fiction': 'Sci-Fi' }

export function posterUrl(posterPath) {
  return posterPath ? `${TMDB_IMAGE_BASE_URL}${POSTER_SIZE}${posterPath}` : null
}

const TOP_CAST_LIMIT = 5

// Only YouTube is handled. TMDB does occasionally carry Vimeo entries, but the
// player is a YouTube embed, so anything else is treated as "no trailer" rather
// than stored and then failing to play.
const TRAILER_SITE = 'YouTube'

function newestFirst(a, b) {
  return String(b.published_at || '').localeCompare(String(a.published_at || ''))
}

// Ranked rather than "first match": TMDB returns videos in no useful order, and
// an official trailer is nearly always the one a person means. Teasers are a
// last resort so that a film with only a teaser still gets a play button.
export function pickTrailer(videos) {
  const youtube = (videos?.results || []).filter((v) => v.site === TRAILER_SITE && v.key)

  const tiers = [
    youtube.filter((v) => v.type === 'Trailer' && v.official),
    youtube.filter((v) => v.type === 'Trailer'),
    youtube.filter((v) => v.type === 'Teaser')
  ]

  for (const tier of tiers) {
    if (tier.length) {
      const best = [...tier].sort(newestFirst)[0]
      return { key: best.key, site: TRAILER_SITE }
    }
  }
  return null
}

// TMDB has no single "rated" field - it stores a certificate per country - so
// the US entry stands in for the MPAA rating the app already displays. The
// first non-empty certification wins: a country's list also contains premiere
// and physical-release rows that carry an empty string.
export function pickUsCertification(releaseDates) {
  const us = (releaseDates?.results || []).find((r) => r.iso_3166_1 === 'US')
  const rated = (us?.release_dates || []).find((r) => r.certification)?.certification
  return rated || null
}

export function topBilledCast(credits, limit = TOP_CAST_LIMIT) {
  const cast = credits?.cast || []
  // known_for_department filters out crew who also hold a cast credit (a
  // director cameo, say). If it filters everything out - which happens on
  // sparse entries where the field is absent - fall back to raw billing order
  // rather than importing a film with no cast at all.
  const actors = cast.filter((c) => c.known_for_department === 'Acting')
  const source = actors.length ? actors : cast

  return [...source]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, limit)
    .map((c) => c.name)
    .filter(Boolean)
}

export function mapGenreNames(genres) {
  return (genres || []).map((g) => GENRE_ALIASES[g.name] || g.name).filter(Boolean)
}

function runtimeFields(runtime) {
  if (!runtime || runtime <= 0) return { runtime_minutes: null, runtime_label: null }
  // Matches OMDb's "164 min" formatting so the existing column renders
  // identically and nothing in the UI has to change.
  return { runtime_minutes: runtime, runtime_label: `${runtime} min` }
}

// Maps a /movie/{id} response (with videos, credits, release_dates and
// external_ids appended) onto the movie payload createMovie expects.
// imdb_rating is deliberately absent - TMDB does not carry it, and it is the
// one field OMDb is still consulted for.
export function mapMovieDetails(data) {
  const trailer = pickTrailer(data.videos)

  return {
    title: data.title || data.original_title || null,
    year: data.release_date ? data.release_date.slice(0, 4) : null,
    rated: pickUsCertification(data.release_dates),
    imdb_id: data.imdb_id || data.external_ids?.imdb_id || null,
    tmdb_id: data.id,
    tmdb_media_type: 'movie',
    trailer_key: trailer?.key ?? null,
    trailer_site: trailer?.site ?? null,
    // Set even when nothing was found, so "checked, has no trailer" is
    // distinguishable from "never looked".
    trailer_checked_at: new Date().toISOString(),
    ...runtimeFields(data.runtime),
    plot: data.overview || null,
    poster_url: posterUrl(data.poster_path),
    genreNames: mapGenreNames(data.genres),
    actorNames: topBilledCast(data.credits),
    // Not a movies column - the scanner turns this into a Collection link.
    collectionName: data.belongs_to_collection?.name || null
  }
}
