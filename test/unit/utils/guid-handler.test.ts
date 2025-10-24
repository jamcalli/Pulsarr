import {
  createGuidSet,
  extractImdbId,
  extractRadarrId,
  extractSonarrId,
  extractTmdbId,
  extractTvdbId,
  extractTypedGuid,
  getGuidMatchScore,
  hasMatchingGuids,
  hasMatchingParsedGuids,
  normalizeGuid,
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
})
