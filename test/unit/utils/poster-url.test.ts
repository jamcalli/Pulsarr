import { buildPosterUrl, normalizePosterPath } from '@utils/poster-url.js'
import { describe, expect, it } from 'vitest'

/**
 * Test data sourced from production database watchlist_items.thumb values
 */
const REAL_TMDB_URLS = [
  'https://image.tmdb.org/t/p/original/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg',
  'https://image.tmdb.org/t/p/original/bu5gsRil7sEz7gPIaKRwVEapTgI.jpg',
  'https://image.tmdb.org/t/p/original/wOffjfafVLyav9CMDgBfIv49J9Y.jpg',
  'https://image.tmdb.org/t/p/original/iJFbF43bN1HX5EZl4OFAVmJDl1u.jpg',
  'https://image.tmdb.org/t/p/original/2unV6GQtDKszsEGql5Dylxg4sVP.jpg',
  'https://image.tmdb.org/t/p/original/5ejJ4tRlAjX32IdQZ4F97wCuq7u.jpg',
  'https://image.tmdb.org/t/p/original/rrV0kCmzcP8oB00gemSZDns90rb.jpg',
  'https://image.tmdb.org/t/p/original/wRSnArnQBmeUYb5GWDU595bGsBr.jpg',
]

const REAL_PLEX_METADATA_URLS = [
  'https://metadata-static.plex.tv/b/gracenote/b2abab4888350b94df1f26ff0ea3f7e4.jpg',
  'https://metadata-static.plex.tv/2/gracenote/29cefbccdc72ebe50f3ac6dbdb648df2.jpg',
  'https://metadata-static.plex.tv/c/gracenote/c90e1d4985954857ae41b810885c1f20.jpg',
  'https://metadata-static.plex.tv/b/gracenote/b69b65f2a1126ad43e9872c46210d8b3.jpg',
  'https://metadata-static.plex.tv/0/gracenote/0e3dcb44b72f57dc7c586e1689faf225.jpg',
  'https://metadata-static.plex.tv/8/gracenote/8bc1a99d4a9e5ca2502af34f95e42c93.jpg',
  'https://metadata-static.plex.tv/0/gracenote/03f03614308a5bd45577d9f6f4eaf5c8.jpg',
  'https://metadata-static.plex.tv/1/gracenote/161e930880b997c3b894d8a8719ab9e4.jpg',
  'https://metadata-static.plex.tv/1/gracenote/13158399db921f097788e5aaa63ba8f3.jpg',
  'https://metadata-static.plex.tv/6/gracenote/6337f3374a4d916a6be2723d4aeb4c8c.jpg',
  'https://metadata-static.plex.tv/e/gracenote/e76805f424125da6dc4b6d2adbcaed78.jpg',
]

describe('poster-url', () => {
  describe('normalizePosterPath', () => {
    describe('TMDB URL normalization', () => {
      it('should extract path from TMDB original size URLs', () => {
        expect(
          normalizePosterPath(
            'https://image.tmdb.org/t/p/original/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg',
          ),
        ).toBe('/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg')
      })

      it('should extract path from TMDB w500 size URLs', () => {
        expect(
          normalizePosterPath(
            'https://image.tmdb.org/t/p/w500/bu5gsRil7sEz7gPIaKRwVEapTgI.jpg',
          ),
        ).toBe('/bu5gsRil7sEz7gPIaKRwVEapTgI.jpg')
      })

      it('should extract path from TMDB w300_and_h450_face URLs', () => {
        expect(
          normalizePosterPath(
            'https://image.tmdb.org/t/p/w300_and_h450_face/iJFbF43bN1HX5EZl4OFAVmJDl1u.jpg',
          ),
        ).toBe('/iJFbF43bN1HX5EZl4OFAVmJDl1u.jpg')
      })

      it('should extract path from TMDB w600_and_h900_bestv2 URLs', () => {
        expect(
          normalizePosterPath(
            'https://image.tmdb.org/t/p/w600_and_h900_bestv2/2unV6GQtDKszsEGql5Dylxg4sVP.jpg',
          ),
        ).toBe('/2unV6GQtDKszsEGql5Dylxg4sVP.jpg')
      })

      it('should handle HTTP (non-HTTPS) TMDB URLs', () => {
        expect(
          normalizePosterPath(
            'http://image.tmdb.org/t/p/original/5ejJ4tRlAjX32IdQZ4F97wCuq7u.jpg',
          ),
        ).toBe('/5ejJ4tRlAjX32IdQZ4F97wCuq7u.jpg')
      })

      it('should normalize all real TMDB URLs from database', () => {
        for (const url of REAL_TMDB_URLS) {
          const result = normalizePosterPath(url)
          expect(result).toMatch(/^\/[a-zA-Z0-9]+\.jpg$/)
          expect(result).not.toContain('tmdb.org')
        }
      })
    })

    describe('non-TMDB URL passthrough', () => {
      it('should return Plex metadata URLs unchanged', () => {
        const plexUrl =
          'https://metadata-static.plex.tv/b/gracenote/b2abab4888350b94df1f26ff0ea3f7e4.jpg'
        expect(normalizePosterPath(plexUrl)).toBe(plexUrl)
      })

      it('should return all real Plex metadata URLs unchanged', () => {
        for (const url of REAL_PLEX_METADATA_URLS) {
          expect(normalizePosterPath(url)).toBe(url)
        }
      })

      it('should return other external URLs unchanged', () => {
        const otherUrl = 'https://example.com/poster.jpg'
        expect(normalizePosterPath(otherUrl)).toBe(otherUrl)
      })
    })

    describe('already normalized paths', () => {
      it('should return already normalized paths unchanged', () => {
        expect(normalizePosterPath('/abc123.jpg')).toBe('/abc123.jpg')
        expect(normalizePosterPath('/wRSnArnQBmeUYb5GWDU595bGsBr.jpg')).toBe(
          '/wRSnArnQBmeUYb5GWDU595bGsBr.jpg',
        )
      })
    })

    describe('null/undefined handling', () => {
      it('should return null for null input', () => {
        expect(normalizePosterPath(null)).toBeNull()
      })

      it('should return null for undefined input', () => {
        expect(normalizePosterPath(undefined)).toBeNull()
      })

      it('should return null for empty string', () => {
        expect(normalizePosterPath('')).toBeNull()
      })
    })
  })

  describe('buildPosterUrl', () => {
    describe('building from normalized paths', () => {
      it('should build card-sized URL (default context)', () => {
        expect(buildPosterUrl('/abc123.jpg')).toBe(
          'https://image.tmdb.org/t/p/w300_and_h450_face/abc123.jpg',
        )
      })

      it('should build card-sized URL explicitly', () => {
        expect(buildPosterUrl('/abc123.jpg', 'card')).toBe(
          'https://image.tmdb.org/t/p/w300_and_h450_face/abc123.jpg',
        )
      })

      it('should build detail-sized URL', () => {
        expect(buildPosterUrl('/abc123.jpg', 'detail')).toBe(
          'https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc123.jpg',
        )
      })

      it('should build notification-sized URL', () => {
        expect(buildPosterUrl('/abc123.jpg', 'notification')).toBe(
          'https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc123.jpg',
        )
      })

      it('should build URLs from real extracted paths', () => {
        // Simulate what happens after normalization
        const normalizedPath = '/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg'
        expect(buildPosterUrl(normalizedPath, 'card')).toBe(
          'https://image.tmdb.org/t/p/w300_and_h450_face/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg',
        )
        expect(buildPosterUrl(normalizedPath, 'notification')).toBe(
          'https://image.tmdb.org/t/p/w600_and_h900_bestv2/9z9cYmWl7AH4FKUU4DyROeqKOHa.jpg',
        )
      })
    })

    describe('non-TMDB URL passthrough', () => {
      it('should return Plex metadata URLs unchanged regardless of context', () => {
        const plexUrl =
          'https://metadata-static.plex.tv/b/gracenote/b2abab4888350b94df1f26ff0ea3f7e4.jpg'
        expect(buildPosterUrl(plexUrl, 'card')).toBe(plexUrl)
        expect(buildPosterUrl(plexUrl, 'detail')).toBe(plexUrl)
        expect(buildPosterUrl(plexUrl, 'notification')).toBe(plexUrl)
      })

      it('should return all real Plex metadata URLs unchanged', () => {
        for (const url of REAL_PLEX_METADATA_URLS) {
          expect(buildPosterUrl(url, 'card')).toBe(url)
          expect(buildPosterUrl(url, 'notification')).toBe(url)
        }
      })

      it('should return other external URLs unchanged', () => {
        const otherUrl = 'https://example.com/poster.jpg'
        expect(buildPosterUrl(otherUrl, 'card')).toBe(otherUrl)
      })
    })

    describe('un-normalized TMDB URL handling', () => {
      it('should extract and rebuild TMDB URLs with appropriate size', () => {
        const originalUrl = 'https://image.tmdb.org/t/p/original/abc123.jpg'
        expect(buildPosterUrl(originalUrl, 'card')).toBe(
          'https://image.tmdb.org/t/p/w300_and_h450_face/abc123.jpg',
        )
        expect(buildPosterUrl(originalUrl, 'notification')).toBe(
          'https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc123.jpg',
        )
      })

      it('should handle all real TMDB URLs even if not pre-normalized', () => {
        for (const url of REAL_TMDB_URLS) {
          const cardUrl = buildPosterUrl(url, 'card')
          expect(cardUrl).toContain('w300_and_h450_face')
          expect(cardUrl).not.toContain('original')

          const notificationUrl = buildPosterUrl(url, 'notification')
          expect(notificationUrl).toContain('w600_and_h900_bestv2')
          expect(notificationUrl).not.toContain('original')
        }
      })
    })

    describe('null/undefined handling', () => {
      it('should return null for null input', () => {
        expect(buildPosterUrl(null)).toBeNull()
        expect(buildPosterUrl(null, 'card')).toBeNull()
        expect(buildPosterUrl(null, 'notification')).toBeNull()
      })

      it('should return null for undefined input', () => {
        expect(buildPosterUrl(undefined)).toBeNull()
        expect(buildPosterUrl(undefined, 'card')).toBeNull()
      })

      it('should return null for empty string', () => {
        expect(buildPosterUrl('')).toBeNull()
        expect(buildPosterUrl('', 'notification')).toBeNull()
      })
    })
  })

  describe('round-trip normalization and building', () => {
    it('should produce optimized URLs after normalize -> build cycle', () => {
      const originalUrl =
        'https://image.tmdb.org/t/p/original/wRSnArnQBmeUYb5GWDU595bGsBr.jpg'

      // Step 1: Normalize (what happens on ingestion)
      const normalized = normalizePosterPath(originalUrl)
      expect(normalized).toBe('/wRSnArnQBmeUYb5GWDU595bGsBr.jpg')

      // Step 2: Build for card display
      const cardUrl = buildPosterUrl(normalized, 'card')
      expect(cardUrl).toBe(
        'https://image.tmdb.org/t/p/w300_and_h450_face/wRSnArnQBmeUYb5GWDU595bGsBr.jpg',
      )

      // Step 3: Build for notification
      const notificationUrl = buildPosterUrl(normalized, 'notification')
      expect(notificationUrl).toBe(
        'https://image.tmdb.org/t/p/w600_and_h900_bestv2/wRSnArnQBmeUYb5GWDU595bGsBr.jpg',
      )
    })

    it('should handle all real TMDB URLs through full round-trip', () => {
      for (const originalUrl of REAL_TMDB_URLS) {
        const normalized = normalizePosterPath(originalUrl)

        // Verify normalization worked
        expect(normalized).toMatch(/^\/[a-zA-Z0-9]+\.jpg$/)

        // Verify we can build both sizes
        const cardUrl = buildPosterUrl(normalized, 'card')
        const notificationUrl = buildPosterUrl(normalized, 'notification')

        expect(cardUrl).toContain('w300_and_h450_face')
        expect(notificationUrl).toContain('w600_and_h900_bestv2')

        // Verify path is preserved
        expect(cardUrl).toContain(normalized)
        expect(notificationUrl).toContain(normalized)
      }
    })

    it('should preserve Plex metadata URLs through round-trip', () => {
      for (const plexUrl of REAL_PLEX_METADATA_URLS) {
        const normalized = normalizePosterPath(plexUrl)
        expect(normalized).toBe(plexUrl)

        const cardUrl = buildPosterUrl(normalized, 'card')
        expect(cardUrl).toBe(plexUrl)

        const notificationUrl = buildPosterUrl(normalized, 'notification')
        expect(notificationUrl).toBe(plexUrl)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle TMDB URLs with different file extensions', () => {
      expect(
        normalizePosterPath('https://image.tmdb.org/t/p/original/abc.png'),
      ).toBe('/abc.png')
      expect(
        normalizePosterPath('https://image.tmdb.org/t/p/original/abc.webp'),
      ).toBe('/abc.webp')
    })

    it('should handle paths with special characters', () => {
      expect(normalizePosterPath('/abc-123_def.jpg')).toBe('/abc-123_def.jpg')
      expect(buildPosterUrl('/abc-123_def.jpg', 'card')).toBe(
        'https://image.tmdb.org/t/p/w300_and_h450_face/abc-123_def.jpg',
      )
    })

    it('should handle deeply nested TMDB paths', () => {
      // TMDB doesn't use nested paths, but verify the regex handles slashes
      const deepPath = 'https://image.tmdb.org/t/p/original/a/b/c/poster.jpg'
      const result = normalizePosterPath(deepPath)
      expect(result).toBe('/a/b/c/poster.jpg')
    })

    it('should not match similar but incorrect URLs', () => {
      // Missing /t/p/ segment
      const badUrl1 = 'https://image.tmdb.org/original/abc.jpg'
      expect(normalizePosterPath(badUrl1)).toBe(badUrl1)

      // Different domain
      const badUrl2 = 'https://image.tmdb.com/t/p/original/abc.jpg'
      expect(normalizePosterPath(badUrl2)).toBe(badUrl2)

      // Subdomain variation
      const badUrl3 = 'https://cdn.image.tmdb.org/t/p/original/abc.jpg'
      expect(normalizePosterPath(badUrl3)).toBe(badUrl3)
    })

    it('should handle URL with query parameters', () => {
      // TMDB URLs typically don't have query params, but handle gracefully
      const urlWithQuery =
        'https://image.tmdb.org/t/p/original/abc.jpg?quality=high'
      const result = normalizePosterPath(urlWithQuery)
      expect(result).toBe('/abc.jpg?quality=high')
    })
  })
})
