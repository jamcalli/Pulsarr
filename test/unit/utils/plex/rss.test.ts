import type { PlexApiResponse, RssResponse } from '@root/types/plex.types.js'
import {
  fetchWatchlistFromRss,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from '@services/plex-watchlist/index.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/rss', () => {
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getRssFromPlexToken', () => {
    it('should return RSS URL when API responds successfully', async () => {
      server.use(
        http.post(
          'https://discover.provider.plex.tv/rss',
          async ({ request }) => {
            const body = await request.json()
            const url = new URL(request.url)

            if (
              body &&
              typeof body === 'object' &&
              'feedType' in body &&
              body.feedType === 'watchlist' &&
              url.searchParams.get('X-Plex-Client-Identifier') === 'pulsarr' &&
              url.searchParams.get('format') === 'json'
            ) {
              return HttpResponse.json({
                RSSInfo: [
                  {
                    url: 'https://rss.plex.tv/feed/watchlist/abc123',
                  },
                ],
              } as PlexApiResponse)
            }
            return new HttpResponse(null, { status: 400 })
          },
        ),
      )

      const result = await getRssFromPlexToken(
        'valid-token',
        'watchlist',
        mockLogger,
      )
      expect(result).toBe('https://rss.plex.tv/feed/watchlist/abc123')
    })

    it('should return null when RSSInfo is empty', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return HttpResponse.json({
            RSSInfo: [],
          } as PlexApiResponse)
        }),
      )

      const result = await getRssFromPlexToken('token', 'watchlist', mockLogger)
      expect(result).toBe(null)
    })

    it('should return null when RSSInfo is missing', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return HttpResponse.json({})
        }),
      )

      const result = await getRssFromPlexToken('token', 'watchlist', mockLogger)
      expect(result).toBe(null)
    })

    it('should return null when API responds with 401', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return new HttpResponse(null, {
            status: 401,
            statusText: 'Unauthorized',
          })
        }),
      )

      const result = await getRssFromPlexToken(
        'invalid-token',
        'watchlist',
        mockLogger,
      )
      expect(result).toBe(null)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unable to generate an RSS feed: Unauthorized',
      )
    })

    it('should return null when network error occurs', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return HttpResponse.error()
        }),
      )

      const result = await getRssFromPlexToken('token', 'watchlist', mockLogger)
      expect(result).toBe(null)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to generate an RSS feed'),
      )
    })

    it('should send correct request body for friendsWatchlist', async () => {
      let capturedBody: unknown = null

      server.use(
        http.post(
          'https://discover.provider.plex.tv/rss',
          async ({ request }) => {
            capturedBody = await request.json()
            return HttpResponse.json({
              RSSInfo: [{ url: 'https://rss.plex.tv/feed/friends/xyz' }],
            } as PlexApiResponse)
          },
        ),
      )

      await getRssFromPlexToken('token', 'friendsWatchlist', mockLogger)
      expect(capturedBody).toEqual({ feedType: 'friendsWatchlist' })
    })

    it('should include correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.post('https://discover.provider.plex.tv/rss', ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({
            RSSInfo: [{ url: 'test' }],
          } as PlexApiResponse)
        }),
      )

      await getRssFromPlexToken('test-token', 'watchlist', mockLogger)

      expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
      expect(capturedHeaders?.get('X-Plex-Token')).toBe('test-token')
    })

    it('should log debug message on success', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return HttpResponse.json({
            RSSInfo: [{ url: 'test' }],
          } as PlexApiResponse)
        }),
      )

      await getRssFromPlexToken('token', 'watchlist', mockLogger)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Got a result from Plex when generating RSS feed, attempting to decode',
      )
    })
  })

  describe('getPlexWatchlistUrls', () => {
    it('should generate RSS URLs for self watchlist when skipFriendSync is true', async () => {
      server.use(
        http.post(
          'https://discover.provider.plex.tv/rss',
          async ({ request }) => {
            const body = await request.json()
            if (
              body &&
              typeof body === 'object' &&
              'feedType' in body &&
              body.feedType === 'watchlist'
            ) {
              return HttpResponse.json({
                RSSInfo: [{ url: 'https://rss.plex.tv/feed/watchlist/abc' }],
              } as PlexApiResponse)
            }
            return new HttpResponse(null, { status: 400 })
          },
        ),
      )

      const tokens = new Set(['token1'])
      const result = await getPlexWatchlistUrls(tokens, true, mockLogger)

      expect(result.selfRss).toBe('https://rss.plex.tv/feed/watchlist/abc')
      expect(result.friendsRss).toBeNull()
    })

    it('should generate RSS URLs for both self and friends when skipFriendSync is false', async () => {
      server.use(
        http.post(
          'https://discover.provider.plex.tv/rss',
          async ({ request }) => {
            const body = await request.json()
            if (body && typeof body === 'object' && 'feedType' in body) {
              if (body.feedType === 'watchlist') {
                return HttpResponse.json({
                  RSSInfo: [{ url: 'https://rss.plex.tv/feed/watchlist/abc' }],
                } as PlexApiResponse)
              }
              if (body.feedType === 'friendsWatchlist') {
                return HttpResponse.json({
                  RSSInfo: [{ url: 'https://rss.plex.tv/feed/friends/xyz' }],
                } as PlexApiResponse)
              }
            }
            return new HttpResponse(null, { status: 400 })
          },
        ),
      )

      const tokens = new Set(['token1'])
      const result = await getPlexWatchlistUrls(tokens, false, mockLogger)

      expect(result.selfRss).toBe('https://rss.plex.tv/feed/watchlist/abc')
      expect(result.friendsRss).toBe('https://rss.plex.tv/feed/friends/xyz')
    })

    it('should use first token only (single-token design)', async () => {
      let callCount = 0
      server.use(
        http.post(
          'https://discover.provider.plex.tv/rss',
          async ({ request }) => {
            const body = await request.json()
            if (
              body &&
              typeof body === 'object' &&
              'feedType' in body &&
              body.feedType === 'watchlist'
            ) {
              callCount++
              return HttpResponse.json({
                RSSInfo: [
                  { url: `https://rss.plex.tv/feed/watchlist/${callCount}` },
                ],
              } as PlexApiResponse)
            }
            return new HttpResponse(null, { status: 400 })
          },
        ),
      )

      const tokens = new Set(['token1', 'token2'])
      const result = await getPlexWatchlistUrls(tokens, true, mockLogger)

      // Only first token is used
      expect(callCount).toBe(1)
      expect(result.selfRss).toBe('https://rss.plex.tv/feed/watchlist/1')
    })

    it('should return null for failed RSS fetch', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const tokens = new Set(['invalid-token'])
      const result = await getPlexWatchlistUrls(tokens, true, mockLogger)

      expect(result.selfRss).toBeNull()
      expect(result.friendsRss).toBeNull()
    })

    it('should log warning when no RSS URLs are generated', async () => {
      server.use(
        http.post('https://discover.provider.plex.tv/rss', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const tokens = new Set(['invalid-token'])
      const result = await getPlexWatchlistUrls(tokens, true, mockLogger)

      expect(result.selfRss).toBeNull()
      expect(result.friendsRss).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Missing RSS URL. Are you an active Plex Pass user?',
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Real-time RSS sync disabled',
      )
    })

    it('should return nulls for empty token set', async () => {
      const tokens = new Set<string>()
      const result = await getPlexWatchlistUrls(tokens, true, mockLogger)

      expect(result.selfRss).toBeNull()
      expect(result.friendsRss).toBeNull()
    })
  })

  describe('fetchWatchlistFromRss', () => {
    it('should fetch and parse RSS feed items', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Test Movie',
            pubDate: '2024-01-01',
            link: 'https://example.com/movie',
            description: 'Test movie description',
            category: 'movie',
            credits: [],
            thumbnail: { url: 'https://example.com/thumb.jpg' },
            guids: ['tmdb://12345', 'imdb://tt1234567'],
            keywords: ['Action', 'Thriller'],
          },
          {
            title: 'Test Show',
            pubDate: '2024-01-02',
            link: 'https://example.com/show',
            description: 'Test show description',
            category: 'show',
            credits: [],
            thumbnail: { url: 'https://example.com/show.jpg' },
            guids: ['tvdb://67890'],
            keywords: ['Drama'],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/watchlist/abc', ({ request }) => {
          const url = new URL(request.url)
          if (url.searchParams.get('format') === 'json') {
            return HttpResponse.json(mockRssResponse)
          }
          return new HttpResponse(null, { status: 400 })
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/watchlist/abc',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(result.size).toBe(2)
      const items = Array.from(result)

      expect(items[0].title).toBe('Test Movie')
      expect(items[0].type).toBe('MOVIE')
      expect(items[0].guids).toContain('tmdb:12345')
      expect(items[0].guids).toContain('imdb:tt1234567')
      expect(items[0].genres).toContain('Action')
      expect(items[0].user_id).toBe(1)
      expect(items[0].status).toBe('pending')

      expect(items[1].title).toBe('Test Show')
      expect(items[1].type).toBe('SHOW')
    })

    it('should handle friendsRSS prefix', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Friend Movie',
            pubDate: '2024-01-01',
            link: 'https://example.com/movie',
            description: 'Test',
            category: 'movie',
            credits: [],
            guids: ['tmdb://11111'],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/friends/xyz', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/friends/xyz',
        'friendsRSS',
        2,
        mockLogger,
      )

      const items = Array.from(result)
      expect(items[0].key).toMatch(/^friendsRSS_/)
      expect(items[0].user_id).toBe(2)
    })

    it('should handle missing optional fields', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Minimal Item',
            pubDate: '2024-01-01',
            link: 'https://example.com/item',
            description: '',
            category: '',
            credits: [],
            guids: [],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      const items = Array.from(result)
      expect(items[0].title).toBe('Minimal Item')
      expect(items[0].type).toBe('UNKNOWN')
      expect(items[0].thumb).toBe('')
      expect(items[0].guids).toEqual([])
      expect(items[0].genres).toEqual([])
    })

    it('should normalize genre capitalization', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Test',
            pubDate: '2024-01-01',
            link: 'https://example.com/item',
            description: '',
            category: 'movie',
            credits: [],
            guids: [],
            keywords: ['action', 'science fiction', 'sci-fi & fantasy'],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      const items = Array.from(result)
      expect(items[0].genres).toContain('Action')
      expect(items[0].genres).toContain('Science Fiction')
      expect(items[0].genres).toContain('Sci-Fi & Fantasy')
    })

    it('should filter out empty and whitespace-only guids', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Test',
            pubDate: '2024-01-01',
            link: 'https://example.com/item',
            description: '',
            category: 'movie',
            credits: [],
            guids: ['tmdb://12345', '', '   ', 'imdb://tt1234'],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      const items = Array.from(result)
      // Should only have valid guids (empty string and whitespace filtered out)
      expect(items[0].guids).toHaveLength(2)
      expect(items[0].guids).toContain('tmdb:12345')
      expect(items[0].guids).toContain('imdb:tt1234')
      expect(items[0].guids).not.toContain('')
      expect(items[0].guids).not.toContain('   ')
    })

    it('should return empty set when API responds with 500', async () => {
      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return new HttpResponse(null, { status: 500 })
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://github.com/nylonee/watchlistarr/issues/161',
        ),
      )
    })

    it('should return empty set when API responds with non-500 error', async () => {
      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return new HttpResponse(null, {
            status: 404,
            statusText: 'Not Found',
          })
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unable to fetch watchlist from Plex: Not Found',
      )
    })

    it('should return empty set when network error occurs', async () => {
      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.error()
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to fetch watchlist from Plex'),
      )
    })

    it('should continue processing if one item fails', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Valid Item',
            pubDate: '2024-01-01',
            link: 'https://example.com/item',
            description: '',
            category: 'movie',
            credits: [],
            guids: [],
          },
          // This will cause an error during processing
          null as never,
          {
            title: 'Another Valid Item',
            pubDate: '2024-01-02',
            link: 'https://example.com/item2',
            description: '',
            category: 'show',
            credits: [],
            guids: [],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      // Should have processed at least the valid items (may skip the null)
      expect(result.size).toBeGreaterThanOrEqual(1)
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should handle non-array items field', async () => {
      const mockRssResponse = {
        items: 'not-an-array',
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      const result = await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(result.size).toBe(0)
    })

    it('should add format=json to URL', async () => {
      let capturedUrl: URL | undefined

      server.use(
        http.get('https://rss.plex.tv/feed/test', ({ request }) => {
          capturedUrl = new URL(request.url)
          return HttpResponse.json({
            title: 'Watchlist',
            links: { self: 'test' },
            items: [],
          })
        }),
      )

      await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(capturedUrl?.searchParams.get('format')).toBe('json')
    })

    it('should log debug message with item count', async () => {
      const mockRssResponse: RssResponse = {
        title: 'Watchlist',
        description: 'Test watchlist',
        links: { self: 'test' },
        items: [
          {
            title: 'Item 1',
            pubDate: '2024-01-01',
            link: 'https://example.com/item1',
            description: '',
            category: 'movie',
            credits: [],
            guids: [],
          },
          {
            title: 'Item 2',
            pubDate: '2024-01-02',
            link: 'https://example.com/item2',
            description: '',
            category: 'movie',
            credits: [],
            guids: [],
          },
          {
            title: 'Item 3',
            pubDate: '2024-01-03',
            link: 'https://example.com/item3',
            description: '',
            category: 'movie',
            credits: [],
            guids: [],
          },
        ],
      }

      server.use(
        http.get('https://rss.plex.tv/feed/test', () => {
          return HttpResponse.json(mockRssResponse)
        }),
      )

      await fetchWatchlistFromRss(
        'https://rss.plex.tv/feed/test',
        'selfRSS',
        1,
        mockLogger,
      )

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Successfully processed 3 items from RSS feed',
      )
    })
  })
})
