import type { Config } from '@root/types/config.types.js'
import type { PlexApiResponse } from '@root/types/plex.types.js'
import { getFriends } from '@root/utils/plex/friends-api.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/friends-api', () => {
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getFriends', () => {
    it('should return friends when API responds successfully', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              allFriendsV2: [
                {
                  user: {
                    id: 'friend-id-1',
                    username: 'friend1',
                  },
                },
                {
                  user: {
                    id: 'friend-id-2',
                    username: 'friend2',
                  },
                },
              ],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['valid-token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(true)
      expect(result.hasApiErrors).toBe(false)
      expect(result.friends.size).toBe(2)

      const friendsArray = Array.from(result.friends)
      expect(friendsArray[0][0].watchlistId).toBe('friend-id-1')
      expect(friendsArray[0][0].username).toBe('friend1')
      expect(friendsArray[0][1]).toBe('valid-token')
      expect(friendsArray[1][0].watchlistId).toBe('friend-id-2')
      expect(friendsArray[1][0].username).toBe('friend2')
    })

    it('should return empty friends when user has no friends', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              allFriendsV2: [],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['valid-token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(true)
      expect(result.hasApiErrors).toBe(false)
      expect(result.friends.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No friends found for Plex token',
      )
    })

    it('should deduplicate friends across multiple tokens', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              allFriendsV2: [
                {
                  user: {
                    id: 'friend-id-1',
                    username: 'friend1',
                  },
                },
                {
                  user: {
                    id: 'friend-id-2',
                    username: 'friend2',
                  },
                },
              ],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token1', 'token2'],
      } as Config

      const result = await getFriends(config, mockLogger)

      // Should deduplicate by watchlistId
      expect(result.friends.size).toBe(2)
      expect(result.success).toBe(true)
    })

    it('should handle mixed success and failure across tokens', async () => {
      server.use(
        http.post('https://community.plex.tv/api', ({ request }) => {
          const token = request.headers.get('X-Plex-Token')
          if (token === 'valid-token') {
            return HttpResponse.json({
              data: {
                allFriendsV2: [
                  {
                    user: {
                      id: 'friend-id-1',
                      username: 'friend1',
                    },
                  },
                ],
              },
            } as PlexApiResponse)
          }
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const config: Config = {
        plexTokens: ['valid-token', 'invalid-token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(true)
      expect(result.hasApiErrors).toBe(true)
      expect(result.friends.size).toBe(1)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('(with some API errors)'),
      )
    })

    it('should return failure when no tokens configured', async () => {
      const config = {
        plexTokens: [],
      } as unknown as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
      expect(result.friends.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith('No Plex tokens configured')
    })

    it('should return failure when plexTokens is null', async () => {
      const config = {
        plexTokens: null,
      } as unknown as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
      expect(result.friends.size).toBe(0)
    })

    it('should skip falsy tokens', async () => {
      let requestCount = 0
      server.use(
        http.post('https://community.plex.tv/api', () => {
          requestCount++
          return HttpResponse.json({
            data: {
              allFriendsV2: [],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['valid-token', '', null as never, undefined as never],
      } as Config

      await getFriends(config, mockLogger)

      // Should only make 1 request (for 'valid-token')
      expect(requestCount).toBe(1)
    })

    it('should handle API error responses', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, {
            status: 500,
            statusText: 'Internal Server Error',
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unable to fetch friends from Plex: Internal Server Error',
      )
    })

    it('should handle GraphQL errors in response', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            errors: [
              {
                message: 'GraphQL query error',
              },
            ],
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GraphQL errors'),
      )
    })

    it('should handle network errors', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.error()
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to fetch friends from Plex'),
      )
    })

    it('should handle timeout errors', async () => {
      server.use(
        http.post('https://community.plex.tv/api', async () => {
          await new Promise((resolve) => setTimeout(resolve, 6000))
          return HttpResponse.json({
            data: { allFriendsV2: [] },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.hasApiErrors).toBe(true)
    }, 10000)

    it('should send correct GraphQL query', async () => {
      let capturedBody: unknown = null

      server.use(
        http.post('https://community.plex.tv/api', async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({
            data: { allFriendsV2: [] },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      await getFriends(config, mockLogger)

      expect(capturedBody).toHaveProperty('query')
      expect((capturedBody as { query: string }).query).toContain(
        'allFriendsV2',
      )
    })

    it('should include correct headers', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.post('https://community.plex.tv/api', ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({
            data: { allFriendsV2: [] },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['test-token'],
      } as Config

      await getFriends(config, mockLogger)

      expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
      expect(capturedHeaders?.get('X-Plex-Token')).toBe('test-token')
    })

    it('should log debug messages during execution', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              allFriendsV2: [
                {
                  user: {
                    id: 'friend-id-1',
                    username: 'friend1',
                  },
                },
              ],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      await getFriends(config, mockLogger)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Fetching friends with Plex token',
      )
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Response JSON'),
      )
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Added friend: friend1'),
      )
    })

    it('should log success message with friend count', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              allFriendsV2: [
                {
                  user: {
                    id: 'friend-id-1',
                    username: 'friend1',
                  },
                },
                {
                  user: {
                    id: 'friend-id-2',
                    username: 'friend2',
                  },
                },
              ],
            },
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      await getFriends(config, mockLogger)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Friends fetched successfully. Got 2 unique friends',
      )
    })

    it('should log error when all tokens fail', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const config: Config = {
        plexTokens: ['token1', 'token2'],
      } as Config

      await getFriends(config, mockLogger)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch friends from any token',
      )
    })

    it('should handle missing data.allFriendsV2 in response', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {},
          } as PlexApiResponse)
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await getFriends(config, mockLogger)

      expect(result.success).toBe(false)
      expect(result.friends.size).toBe(0)
    })
  })
})
