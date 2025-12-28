import {
  createGuidSet,
  extractImdbId,
  extractPlexKey,
  extractRadarrId,
  extractSonarrId,
  extractTmdbId,
  extractTvdbId,
  extractTypedGuid,
  getGuidMatchScore,
  getTmdbUrl,
  hasMatchingGuids,
  hasMatchingParsedGuids,
  normalizeGenre,
  normalizeGuid,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import { describe, expect, it } from 'vitest'

describe('guid-handler', () => {
  describe('normalizeGuid', () => {
    it('should normalize provider://id to provider:id', () => {
      expect(normalizeGuid('tmdb://12345')).toBe('tmdb:12345')
      expect(normalizeGuid('tvdb://67890')).toBe('tvdb:67890')
    })

    it('should convert to lowercase', () => {
      expect(normalizeGuid('TMDB://12345')).toBe('tmdb:12345')
      expect(normalizeGuid('TvDb://67890')).toBe('tvdb:67890')
    })

    it('should handle already normalized guids', () => {
      expect(normalizeGuid('tmdb:12345')).toBe('tmdb:12345')
    })
  })

  describe('parseGuids', () => {
    it('should parse JSON string of guids and normalize them', () => {
      const guidsJson = '["tmdb://12345","imdb://tt1234"]'
      const result = parseGuids(guidsJson)
      expect(result).toEqual(['tmdb:12345', 'imdb:tt1234'])
    })

    it('should normalize guids in an array', () => {
      const guids = ['tmdb://12345', 'imdb://tt1234']
      const result = parseGuids(guids)
      expect(result).toEqual(['tmdb:12345', 'imdb:tt1234'])
    })

    it('should handle comma-separated string', () => {
      const result = parseGuids('tmdb://12345,tvdb://67890')
      expect(result).toEqual(['tmdb:12345', 'tvdb:67890'])
    })

    it('should handle single guid string', () => {
      const result = parseGuids('tmdb://12345')
      expect(result).toEqual(['tmdb:12345'])
    })

    it('should deduplicate guids', () => {
      const result = parseGuids([
        'tmdb://12345',
        'tmdb://12345',
        'tvdb://67890',
      ])
      expect(result).toEqual(['tmdb:12345', 'tvdb:67890'])
    })

    it('should return empty array for invalid input', () => {
      expect(parseGuids(undefined)).toEqual([])
      expect(parseGuids('')).toEqual([])
      expect(parseGuids('   ')).toEqual([])
    })

    it('should filter out empty strings', () => {
      const result = parseGuids(['tmdb://12345', '', '  ', 'tvdb://67890'])
      expect(result).toEqual(['tmdb:12345', 'tvdb:67890'])
    })
  })

  describe('hasMatchingGuids', () => {
    it('should return true when guids match', () => {
      const guids1 = ['tmdb://12345', 'imdb://tt1234']
      const guids2 = ['tvdb://67890', 'tmdb://12345']
      expect(hasMatchingGuids(guids1, guids2)).toBe(true)
    })

    it('should return false when no guids match', () => {
      const guids1 = ['tmdb://12345']
      const guids2 = ['tvdb://67890']
      expect(hasMatchingGuids(guids1, guids2)).toBe(false)
    })

    it('should handle string inputs', () => {
      expect(hasMatchingGuids('tmdb://12345', '["tmdb://12345"]')).toBe(true)
    })

    it('should return false for empty inputs', () => {
      expect(hasMatchingGuids([], [])).toBe(false)
      expect(hasMatchingGuids(undefined, undefined)).toBe(false)
    })
  })

  describe('createGuidSet', () => {
    it('should create set from array of items with guids', () => {
      const items = [
        { guids: ['tmdb://12345', 'imdb://tt1234'] },
        { guids: 'tvdb://67890' },
        { guids: undefined },
      ]
      const result = createGuidSet(items)
      expect(result).toEqual(
        new Set(['tmdb:12345', 'imdb:tt1234', 'tvdb:67890']),
      )
    })

    it('should deduplicate across items', () => {
      const items = [
        { guids: ['tmdb://12345'] },
        { guids: ['tmdb://12345', 'tvdb://67890'] },
      ]
      const result = createGuidSet(items)
      expect(result).toEqual(new Set(['tmdb:12345', 'tvdb:67890']))
    })

    it('should handle empty array', () => {
      const result = createGuidSet([])
      expect(result).toEqual(new Set())
    })
  })

  describe('extractTypedGuid', () => {
    it('should extract guid with specific prefix', () => {
      const guids = ['tmdb://12345', 'tvdb://67890', 'imdb://tt1234']
      expect(extractTypedGuid(guids, 'tmdb:')).toBe('tmdb:12345')
      expect(extractTypedGuid(guids, 'tvdb:')).toBe('tvdb:67890')
      expect(extractTypedGuid(guids, 'imdb:')).toBe('imdb:tt1234')
    })

    it('should return undefined when type not found', () => {
      const guids = ['tmdb://12345']
      expect(extractTypedGuid(guids, 'tvdb:')).toBeUndefined()
    })

    it('should return first match when multiple exist', () => {
      const guids = ['tmdb://111', 'tmdb://222']
      expect(extractTypedGuid(guids, 'tmdb:')).toBe('tmdb:111')
    })
  })

  describe('extractTmdbId', () => {
    it('should extract TMDB ID from guids array', () => {
      const guids = ['plex://movie/5d776...', 'tmdb://12345', 'imdb://tt1234']
      expect(extractTmdbId(guids)).toBe(12345)
    })

    it('should return 0 if no TMDB ID found', () => {
      const guids = ['plex://movie/5d776...', 'imdb://tt1234']
      expect(extractTmdbId(guids)).toBe(0)
    })

    it('should handle empty array', () => {
      expect(extractTmdbId([])).toBe(0)
    })

    it('should return 0 for invalid TMDB ID', () => {
      const guids = ['tmdb://invalid']
      expect(extractTmdbId(guids)).toBe(0)
    })

    it('should handle string input', () => {
      expect(extractTmdbId('tmdb://12345')).toBe(12345)
    })
  })

  describe('getTmdbUrl', () => {
    it('should return movie URL for movie type', () => {
      const guids = ['tmdb://12345', 'imdb://tt1234']
      expect(getTmdbUrl(guids, 'movie')).toBe(
        'https://www.themoviedb.org/movie/12345',
      )
    })

    it('should return TV URL for show type', () => {
      const guids = ['tmdb://67890', 'tvdb://11111']
      expect(getTmdbUrl(guids, 'show')).toBe(
        'https://www.themoviedb.org/tv/67890',
      )
    })

    it('should return undefined when no TMDB ID found', () => {
      const guids = ['tvdb://12345', 'imdb://tt1234']
      expect(getTmdbUrl(guids, 'movie')).toBeUndefined()
    })

    it('should return undefined for empty guids', () => {
      expect(getTmdbUrl([], 'movie')).toBeUndefined()
      expect(getTmdbUrl(undefined, 'show')).toBeUndefined()
    })

    it('should handle string input', () => {
      expect(getTmdbUrl('tmdb://12345', 'movie')).toBe(
        'https://www.themoviedb.org/movie/12345',
      )
    })

    it('should include season in URL when provided', () => {
      const guids = ['tmdb://67890']
      expect(getTmdbUrl(guids, 'show', { seasonNumber: 2 })).toBe(
        'https://www.themoviedb.org/tv/67890/season/2',
      )
    })

    it('should include season and episode in URL when both provided', () => {
      const guids = ['tmdb://67890']
      expect(
        getTmdbUrl(guids, 'show', { seasonNumber: 2, episodeNumber: 5 }),
      ).toBe('https://www.themoviedb.org/tv/67890/season/2/episode/5')
    })

    it('should not include episode without season', () => {
      const guids = ['tmdb://67890']
      expect(getTmdbUrl(guids, 'show', { episodeNumber: 5 })).toBe(
        'https://www.themoviedb.org/tv/67890',
      )
    })

    it('should handle season 0 (specials)', () => {
      const guids = ['tmdb://67890']
      expect(getTmdbUrl(guids, 'show', { seasonNumber: 0 })).toBe(
        'https://www.themoviedb.org/tv/67890/season/0',
      )
    })

    it('should handle episode 0', () => {
      const guids = ['tmdb://67890']
      expect(
        getTmdbUrl(guids, 'show', { seasonNumber: 1, episodeNumber: 0 }),
      ).toBe('https://www.themoviedb.org/tv/67890/season/1/episode/0')
    })

    it('should ignore episode details for movie type', () => {
      const guids = ['tmdb://12345']
      expect(
        getTmdbUrl(guids, 'movie', { seasonNumber: 1, episodeNumber: 1 }),
      ).toBe('https://www.themoviedb.org/movie/12345')
    })
  })

  describe('extractTvdbId', () => {
    it('should extract TVDB ID from guids array', () => {
      const guids = ['plex://show/5d776...', 'tvdb://456789', 'imdb://tt1234']
      expect(extractTvdbId(guids)).toBe(456789)
    })

    it('should return 0 if no TVDB ID found', () => {
      const guids = ['plex://show/5d776...', 'tmdb://12345']
      expect(extractTvdbId(guids)).toBe(0)
    })

    it('should return 0 for invalid TVDB ID', () => {
      const guids = ['tvdb://abc']
      expect(extractTvdbId(guids)).toBe(0)
    })
  })

  describe('extractImdbId', () => {
    it('should extract IMDb ID from guids array', () => {
      const guids = ['tmdb://12345', 'imdb://tt1234567']
      expect(extractImdbId(guids)).toBe(1234567)
    })

    it('should handle IMDb ID without tt prefix', () => {
      const guids = ['imdb://1234567']
      expect(extractImdbId(guids)).toBe(1234567)
    })

    it('should return 0 if no IMDb ID found', () => {
      const guids = ['tmdb://12345']
      expect(extractImdbId(guids)).toBe(0)
    })

    it('should return 0 for invalid IMDb ID', () => {
      const guids = ['imdb://ttinvalid']
      expect(extractImdbId(guids)).toBe(0)
    })
  })

  describe('getGuidMatchScore', () => {
    it('should return count of matching GUIDs', () => {
      const guids1 = ['tmdb:12345', 'tvdb:67890', 'imdb:tt1234']
      const guids2 = ['tmdb:12345', 'tvdb:67890']
      expect(getGuidMatchScore(guids1, guids2)).toBe(2)
    })

    it('should return 0 for no matches', () => {
      const guids1 = ['tmdb:12345']
      const guids2 = ['tvdb:67890']
      expect(getGuidMatchScore(guids1, guids2)).toBe(0)
    })

    it('should return 1 for exact match', () => {
      const guids1 = ['plex:movie/5d776825880197001ec967c4']
      const guids2 = ['plex:movie/5d776825880197001ec967c4']
      expect(getGuidMatchScore(guids1, guids2)).toBe(1)
    })

    it('should handle empty arrays', () => {
      expect(getGuidMatchScore([], [])).toBe(0)
      expect(getGuidMatchScore(['tmdb:123'], [])).toBe(0)
    })
  })

  describe('hasMatchingParsedGuids', () => {
    it('should return true when parsed guids match', () => {
      const guids1 = ['tmdb:12345', 'imdb:tt1234']
      const guids2 = ['tvdb:67890', 'tmdb:12345']
      expect(hasMatchingParsedGuids(guids1, guids2)).toBe(true)
    })

    it('should return false when no guids match', () => {
      const guids1 = ['tmdb:12345']
      const guids2 = ['tvdb:67890']
      expect(hasMatchingParsedGuids(guids1, guids2)).toBe(false)
    })

    it('should return false for empty arrays', () => {
      expect(hasMatchingParsedGuids([], [])).toBe(false)
    })
  })

  describe('extractRadarrId', () => {
    it('should extract Radarr ID from guids', () => {
      const guids = ['tmdb://12345', 'radarr://999']
      expect(extractRadarrId(guids)).toBe(999)
    })

    it('should handle case-insensitive match', () => {
      const guids = ['RADARR://777']
      expect(extractRadarrId(guids)).toBe(777)
    })

    it('should return 0 if no Radarr ID found', () => {
      const guids = ['tmdb://12345']
      expect(extractRadarrId(guids)).toBe(0)
    })

    it('should return 0 for invalid Radarr ID', () => {
      const guids = ['radarr://invalid']
      expect(extractRadarrId(guids)).toBe(0)
    })

    it('should return first valid Radarr ID', () => {
      const guids = ['radarr://111', 'radarr://222']
      expect(extractRadarrId(guids)).toBe(111)
    })
  })

  describe('extractSonarrId', () => {
    it('should extract Sonarr ID from guids', () => {
      const guids = ['tvdb://12345', 'sonarr://888']
      expect(extractSonarrId(guids)).toBe(888)
    })

    it('should handle case-insensitive match', () => {
      const guids = ['SONARR://666']
      expect(extractSonarrId(guids)).toBe(666)
    })

    it('should return 0 if no Sonarr ID found', () => {
      const guids = ['tvdb://12345']
      expect(extractSonarrId(guids)).toBe(0)
    })

    it('should return 0 for invalid Sonarr ID', () => {
      const guids = ['sonarr://invalid']
      expect(extractSonarrId(guids)).toBe(0)
    })

    it('should return first valid Sonarr ID', () => {
      const guids = ['sonarr://111', 'sonarr://222']
      expect(extractSonarrId(guids)).toBe(111)
    })
  })

  describe('extractPlexKey', () => {
    it('should extract key from plex movie URI', () => {
      expect(extractPlexKey('plex://movie/5d776a42c2c2d8001f8d65f0')).toBe(
        '5d776a42c2c2d8001f8d65f0',
      )
    })

    it('should extract key from plex show URI', () => {
      expect(extractPlexKey('plex://show/5d9c086fe9d34a001f8e64e4')).toBe(
        '5d9c086fe9d34a001f8e64e4',
      )
    })

    it('should extract key from library metadata path', () => {
      expect(extractPlexKey('/library/metadata/12345')).toBe('12345')
    })

    it('should return undefined for empty string', () => {
      expect(extractPlexKey('')).toBeUndefined()
    })

    it('should return undefined for undefined', () => {
      expect(extractPlexKey(undefined)).toBeUndefined()
    })

    it('should handle URI with no slashes', () => {
      expect(extractPlexKey('abc123')).toBe('abc123')
    })

    it('should handle URI ending with slash', () => {
      expect(extractPlexKey('plex://movie/abc123/')).toBe('abc123')
    })

    it('should handle URI with multiple trailing slashes', () => {
      expect(extractPlexKey('plex://movie/abc123///')).toBe('abc123')
    })

    it('should extract last segment from complex path', () => {
      expect(extractPlexKey('/library/sections/1/all/12345')).toBe('12345')
    })

    it('should return undefined for root path', () => {
      expect(extractPlexKey('/')).toBeUndefined()
    })

    it('should return undefined for multiple slashes only', () => {
      expect(extractPlexKey('///')).toBeUndefined()
    })

    it('should trim whitespace and return undefined if empty', () => {
      expect(extractPlexKey('  ')).toBeUndefined()
      expect(extractPlexKey('   plex://movie/abc123   ')).toBe('abc123')
    })

    it('should handle URI with query string', () => {
      expect(extractPlexKey('plex://movie/abc123?X-Plex-Token=xyz')).toBe(
        'abc123',
      )
      expect(extractPlexKey('/library/metadata/12345?includeChildren=1')).toBe(
        '12345',
      )
    })

    it('should handle URI with query string and trailing slash', () => {
      expect(extractPlexKey('plex://movie/abc123/?token=xyz')).toBe('abc123')
    })

    it('should handle complex query strings', () => {
      expect(
        extractPlexKey(
          'plex://show/xyz789?X-Plex-Token=abc&includeGuids=1&includeRelated=1',
        ),
      ).toBe('xyz789')
    })

    it('should return undefined for malformed plex URI without key', () => {
      expect(extractPlexKey('plex://movie')).toBeUndefined()
      expect(extractPlexKey('plex://show')).toBeUndefined()
      expect(extractPlexKey('plex://movie/')).toBeUndefined()
      expect(extractPlexKey('plex://show///')).toBeUndefined()
    })
  })

  describe('normalizeGenre', () => {
    it('should convert lowercase genre to title case', () => {
      expect(normalizeGenre('action')).toBe('Action')
      expect(normalizeGenre('drama')).toBe('Drama')
    })

    it('should handle multi-word genres', () => {
      expect(normalizeGenre('science fiction')).toBe('Science Fiction')
      expect(normalizeGenre('romantic comedy')).toBe('Romantic Comedy')
    })

    it('should handle special case genres matching database format', () => {
      // Sci-Fi & Fantasy
      expect(normalizeGenre('sci-fi & fantasy')).toBe('Sci-Fi & Fantasy')
      expect(normalizeGenre('SCI-FI & FANTASY')).toBe('Sci-Fi & Fantasy')
      expect(normalizeGenre('Sci-Fi & Fantasy')).toBe('Sci-Fi & Fantasy')
      // TV Movie
      expect(normalizeGenre('tv movie')).toBe('TV Movie')
      expect(normalizeGenre('TV MOVIE')).toBe('TV Movie')
      // Mini-Series
      expect(normalizeGenre('mini-series')).toBe('Mini-Series')
      expect(normalizeGenre('MINI-SERIES')).toBe('Mini-Series')
      // Film-Noir
      expect(normalizeGenre('film-noir')).toBe('Film-Noir')
      // War & Politics
      expect(normalizeGenre('war & politics')).toBe('War & Politics')
      // Action/Adventure
      expect(normalizeGenre('action/adventure')).toBe('Action/Adventure')
    })

    it('should preserve already title-cased genres', () => {
      expect(normalizeGenre('Action')).toBe('Action')
      expect(normalizeGenre('Science Fiction')).toBe('Science Fiction')
    })

    it('should normalize all-uppercase genres to title case', () => {
      expect(normalizeGenre('ACTION')).toBe('Action')
      expect(normalizeGenre('SCIENCE FICTION')).toBe('Science Fiction')
      expect(normalizeGenre('DRAMA')).toBe('Drama')
    })

    it('should trim whitespace', () => {
      expect(normalizeGenre('  action  ')).toBe('Action')
      expect(normalizeGenre('\tdrama\n')).toBe('Drama')
    })

    it('should return empty string for empty input', () => {
      expect(normalizeGenre('')).toBe('')
      expect(normalizeGenre('   ')).toBe('')
    })

    it('should handle hyphenated genres', () => {
      expect(normalizeGenre('rom-com')).toBe('Rom-com')
      expect(normalizeGenre('sci-fi')).toBe('Sci-fi')
      expect(normalizeGenre('ROM-COM')).toBe('Rom-com')
    })

    it('should handle genres with special characters', () => {
      expect(normalizeGenre('action & adventure')).toBe('Action & Adventure')
    })
  })

  describe('parseGenres', () => {
    it('should handle array input', () => {
      const genres = ['Action', 'Drama', 'Sci-Fi']
      expect(parseGenres(genres)).toEqual(['Action', 'Drama', 'Sci-Fi'])
    })

    it('should filter out non-string values from arrays', () => {
      const genres = [
        'Action',
        123,
        null,
        undefined,
        'Drama',
        false,
        'Thriller',
      ]
      expect(parseGenres(genres)).toEqual(['Action', 'Drama', 'Thriller'])
    })

    it('should return empty array for empty array', () => {
      expect(parseGenres([])).toEqual([])
    })

    it('should handle JSON string array', () => {
      const genresJson = '["Action", "Drama", "Sci-Fi"]'
      expect(parseGenres(genresJson)).toEqual(['Action', 'Drama', 'Sci-Fi'])
    })

    it('should filter non-string values from JSON arrays', () => {
      const genresJson = '["Action", 123, null, "Drama"]'
      expect(parseGenres(genresJson)).toEqual(['Action', 'Drama'])
    })

    it('should return empty array for non-array JSON', () => {
      const genresJson = '{"genre": "Action"}'
      expect(parseGenres(genresJson)).toEqual([])
    })

    it('should handle single string (Plex RSS feeds)', () => {
      expect(parseGenres('Action')).toEqual(['Action'])
      expect(parseGenres('Science Fiction')).toEqual(['Science Fiction'])
    })

    it('should trim whitespace from single string', () => {
      expect(parseGenres('  Action  ')).toEqual(['Action'])
      expect(parseGenres('  Science Fiction  ')).toEqual(['Science Fiction'])
    })

    it('should return empty array for empty string', () => {
      expect(parseGenres('')).toEqual([])
    })

    it('should return empty array for whitespace-only string', () => {
      expect(parseGenres('   ')).toEqual([])
      expect(parseGenres('\t\n  ')).toEqual([])
    })

    it('should return empty array for null', () => {
      expect(parseGenres(null)).toEqual([])
    })

    it('should return empty array for undefined', () => {
      expect(parseGenres(undefined)).toEqual([])
    })

    it('should return empty array for number', () => {
      expect(parseGenres(123)).toEqual([])
    })

    it('should return empty array for boolean', () => {
      expect(parseGenres(true)).toEqual([])
      expect(parseGenres(false)).toEqual([])
    })

    it('should return empty array for object', () => {
      expect(parseGenres({ genre: 'Action' })).toEqual([])
    })

    it('should handle malformed JSON gracefully', () => {
      expect(parseGenres('["Action"')).toEqual(['["Action"'])
      expect(parseGenres('{invalid json}')).toEqual(['{invalid json}'])
    })

    it('should handle mixed case and special characters', () => {
      expect(parseGenres(['Action', 'Sci-Fi & Fantasy', 'Rom-Com'])).toEqual([
        'Action',
        'Sci-Fi & Fantasy',
        'Rom-Com',
      ])
    })
  })
})
