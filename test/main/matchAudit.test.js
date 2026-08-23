import { describe, it, expect } from 'vitest'
import { auditMovie, auditMovies, foldTitle, distinctiveTokens, MIN_SCORE } from '../../src/main/importer/matchAudit'

// Pure module - no electron, no db, no network - so it is exercised directly
// the way tmdbMapper is. Every "not flagged" case below is a false positive
// that a naive title comparison actually produced against a real library.

function verdict(fileName, title, year, imdbId = null) {
  return auditMovie({ id: 1, path: `G:\\movie\\${fileName}`, title, year, imdb_id: imdbId })
}

function flagged(fileName, title, year, imdbId = null) {
  const result = verdict(fileName, title, year, imdbId)
  return result !== null && result.score >= MIN_SCORE
}

describe('foldTitle', () => {
  it('strips punctuation and case, like normalizeTitle', () => {
    expect(foldTitle('Mad Max: Fury Road')).toBe(foldTitle('Mad Max Fury Road'))
  })

  it('folds diacritics, which normalizeTitle alone turns into word breaks', () => {
    expect(foldTitle('Amélie')).toBe('amelie')
    expect(foldTitle('Léon: The Professional')).toBe('leon the professional')
  })

  it('folds ligatures, which NFD does not decompose', () => {
    expect(foldTitle('Æon Flux')).toBe(foldTitle('Aeon Flux'))
  })

  it('joins runs of single letters so initialisms survive punctuation loss', () => {
    expect(foldTitle('G.I. Joe: Retaliation')).toBe(foldTitle('GI Joe Retaliation'))
    expect(foldTitle('Babylon A.D.')).toBe(foldTitle('babylon ad'))
  })

  it('removes digit group separators', () => {
    expect(foldTitle('10,000 BC')).toBe(foldTitle('10000 BC'))
  })

  it('folds a trailing roman numeral but leaves one mid-title alone', () => {
    expect(foldTitle('Rocky II')).toBe(foldTitle('Rocky 2'))
    expect(foldTitle('Star Wars Episode IV A New Hope')).toContain('iv')
  })
})

describe('distinctiveTokens', () => {
  it('drops stopwords, which is what separates the two Harry Potter titles', () => {
    expect([...distinctiveTokens('Harry Potter and the Chamber of Secrets')]).toEqual([
      'harry',
      'potter',
      'chamber',
      'secrets'
    ])
  })

  it('keeps everything when a title is nothing but stopwords', () => {
    expect(distinctiveTokens('The One').size).toBeGreaterThan(0)
  })
})

describe('auditMovie - flags a wrong match', () => {
  it('catches a year that points at a different film entirely', () => {
    expect(flagged('Dune (2021).mkv', 'Dune', '1984')).toBe(true)
  })

  it('catches a sibling in the same series', () => {
    expect(
      flagged(
        'Harry Potter and the Chamber of Secrets (2002).mkv',
        "Harry Potter and the Sorcerer's Stone",
        '2001'
      )
    ).toBe(true)
  })

  it('catches an unrelated film', () => {
    expect(flagged('Inception (2010).mkv', 'Interstellar', '2014')).toBe(true)
  })

  it('catches a numbered sequel mismatch', () => {
    expect(flagged('Toy Story 3 (2010).mkv', 'Toy Story 2', '1999')).toBe(true)
  })

  it('catches a two-year drift - the same title, the other version', () => {
    expect(
      flagged(
        'The Girl with the Dragon Tattoo (2011).mkv',
        'The Girl with the Dragon Tattoo',
        '2009'
      )
    ).toBe(true)
  })

  it('catches an IMDb id in the filename that disagrees with the row', () => {
    const result = verdict('The Shawshank Redemption (tt0111161).mkv', 'The Godfather', '1972', 'tt0068646')
    expect(result.score).toBeGreaterThanOrEqual(MIN_SCORE)
    expect(result.reasons.some((r) => r.startsWith('IMDb ID'))).toBe(true)
  })

  it('explains itself in terms a person can act on', () => {
    const result = verdict('Dune (2021).mkv', 'Dune', '1984')
    expect(result.reasons).toContain('Year: filename says 2021, library says 1984 - 37 years apart')
  })
})

describe('auditMovie - leaves correct rows alone', () => {
  const clean = [
    ['punctuation', 'Mad Max Fury Road (2015).mkv', 'Mad Max: Fury Road', '2015'],
    ['diacritics', 'Amelie (2001).mkv', 'Amélie', '2001'],
    ['diacritics with subtitle', 'Leon The Professional (1994).mkv', 'Léon: The Professional', '1994'],
    ['ligature', 'Aeon Flux (2005).mp4', 'Æon Flux', '2005'],
    ['initialism with periods', 'babylon ad (2008).avi', 'Babylon A.D.', '2008'],
    ['initialism and subtitle', 'GI Joe Retaliation (2013).mp4', 'G.I. Joe: Retaliation', '2013'],
    ['digit separator', '10000 BC (2008).mp4', '10,000 BC', '2008'],
    ['roman numeral', 'Rocky II (1979).mkv', 'Rocky 2', '1979'],
    ['title ending in an impossible year', 'Blade Runner 2049.mkv', 'Blade Runner 2049', '2017'],
    ['title ending in a plausible year', 'Death Race 2000.mkv', 'Death Race 2000', '1975'],
    ['title that is only a year', '2012 (2009).mkv', '2012', '2009'],
    ['scene release naming', 'The.Matrix.1999.1080p.BluRay.x264-AMIABLE.mkv', 'The Matrix', '1999'],
    ['library title shorter than the file', 'Star Wars Episode IV A New Hope (1977).mkv', 'Star Wars', '1977'],
    ['leading parenthetical', '(500) Days of Summer (2009).mkv', '500 Days of Summer', '2009'],
    ['original-language title on disk', 'Le Fabuleux Destin d Amelie Poulain (2001).mkv', 'Amélie', '2001'],
    ['festival vs wide release year', 'Parasite (2019).mkv', 'Parasite', '2020'],
    ['ampersand spelled out', 'Fire and Ice (1983).mkv', 'Fire & Ice', '1983'],
    ['edition tag before the year', 'Title (Directors Cut) (1999).mkv', 'Title', '1999'],
    ['matching IMDb id', 'The Shawshank Redemption (tt0111161).mkv', 'The Shawshank Redemption', '1994']
  ]

  for (const [what, fileName, title, year] of clean) {
    it(`does not flag ${what}`, () => {
      const imdbId = fileName.includes('tt0111161') ? 'tt0111161' : null
      expect(flagged(fileName, title, year, imdbId)).toBe(false)
    })
  }
})

describe('auditMovie - unjudgeable filenames', () => {
  it('skips a filename with nothing to go on', () => {
    expect(verdict('movie.mkv', 'Whatever', '2001')).toBeNull()
  })

  it('skips a one-word title with no usable year', () => {
    expect(verdict('9 (tt0472033).avi', '9', '2009')).toBeNull()
  })
})

describe('auditMovies', () => {
  const rows = [
    { id: 1, path: 'G:\\movie\\Dune (2021).mkv', title: 'Dune', year: '1984', imdb_id: null },
    { id: 2, path: 'G:\\movie\\Inception (2010).mkv', title: 'Interstellar', year: '2014', imdb_id: null },
    { id: 3, path: 'G:\\movie\\The Matrix (1999).mkv', title: 'The Matrix', year: '1999', imdb_id: null },
    { id: 4, path: 'G:\\movie\\movie.mkv', title: 'Whatever', year: '2001', imdb_id: null }
  ]

  it('reports only the suspect rows, worst first', () => {
    const { flagged: hits, scanned, unjudgeable } = auditMovies(rows)
    expect(scanned).toBe(4)
    expect(unjudgeable).toBe(1)
    expect(hits.map((h) => h.id)).toEqual([2, 1])
    expect(hits[0].score).toBeGreaterThan(hits[1].score)
  })

  it('grades severity so the list can be skimmed', () => {
    const { flagged: hits } = auditMovies(rows)
    expect(hits[0].severity).toBe('high')
  })

  it('honours a caller-supplied threshold', () => {
    expect(auditMovies(rows, { minScore: 99 }).flagged).toHaveLength(1)
    expect(auditMovies(rows, { minScore: 5 }).flagged.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to the default threshold for a nonsense one', () => {
    expect(auditMovies(rows, { minScore: 0 }).minScore).toBe(MIN_SCORE)
    expect(auditMovies(rows, { minScore: 'abc' }).minScore).toBe(MIN_SCORE)
  })

  it('carries the filename IMDb id through for the re-match box', () => {
    const withId = [
      {
        id: 9,
        path: 'G:\\movie\\The Shawshank Redemption (tt0111161).mkv',
        title: 'The Godfather',
        year: '1972',
        imdb_id: 'tt0068646'
      }
    ]
    expect(auditMovies(withId).flagged[0].imdbIdFromFilename).toBe('tt0111161')
  })
})
