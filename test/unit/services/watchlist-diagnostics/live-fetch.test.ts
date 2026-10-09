import { PlexRateLimiter } from '@services/plex-watchlist/api/rate-limiter.js'
import {
  DIAGNOSTICS_MAX_PAGES,
  fetchLiveWatchlist,
} from '@services/watchlist-diagnostics/live-fetch.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const DISCOVER_URL =
  'https://discover.provider.plex.tv/library/sections/watchlist/all'
const GRAPHQL_URL = 'https://community.plex.tv/api'

function discoverPage(start: number, size: number, totalSize: number) {
  return {
    MediaContainer: {
      totalSize,
      Metadata: Array.from({ length: size }, (_, i) => ({
        key: `/library/metadata/self-${start + i}`,
        title: `Self ${start + i}`,
        type: 'movie',
      })),
    },
  }
}

function graphqlPage(
  ids: string[],
  hasNextPage: boolean,
  endCursor: string | null,
) {
  return {
    data: {
      userV2: {
        watchlist: {
          nodes: ids.map((id) => ({ id, title: `Friend ${id}`, type: 'SHOW' })),
          pageInfo: { hasNextPage, endCursor },
        },
      },
    },
  }
}

describe('watchlist-diagnostics/live-fetch', () => {
  const log = createMockLogger()

  beforeEach(() => {
    PlexRateLimiter.getInstance().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    server.resetHandlers()
  })

  describe('primary user (self watchlist)', () => {
    it('fetches a single page and normalizes keys and types', async () => {
      const tokens: string[] = []
      server.use(
        http.get(DISCOVER_URL, ({ request }) => {
          tokens.push(request.headers.get('X-Plex-Token') ?? '')
          return HttpResponse.json(discoverPage(0, 2, 2))
        }),
      )

      const result = await fetchLiveWatchlist({
        tokens: ['token-a', 'token-b'],
        isPrimary: true,
        plexUuid: null,
        username: 'owner',
        log,
      })

      expect(result).toEqual({
        source: 'self',
        truncated: false,
        items: [
          { key: 'self-0', title: 'Self 0', type: 'movie' },
          { key: 'self-1', title: 'Self 1', type: 'movie' },
        ],
      })
      // Only the first token owns the self watchlist
      expect(tokens).toEqual(['token-a'])
    })

    it('paginates with the container start offset until totalSize', async () => {
      vi.useFakeTimers()
      const starts: number[] = []
      server.use(
        http.get(DISCOVER_URL, ({ request }) => {
          const start = Number(
            new URL(request.url).searchParams.get('X-Plex-Container-Start'),
          )
          starts.push(start)
          return HttpResponse.json(
            discoverPage(start, start === 200 ? 50 : 100, 250),
          )
        }),
      )

      const promise = fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: true,
        plexUuid: null,
        username: 'owner',
        log,
      })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(starts).toEqual([0, 100, 200])
      expect(result.items).toHaveLength(250)
      expect(result.truncated).toBe(false)
    })

    it('stops at the page cap on a huge watchlist and flags truncation', async () => {
      vi.useFakeTimers()
      let calls = 0
      server.use(
        http.get(DISCOVER_URL, ({ request }) => {
          calls++
          const start = Number(
            new URL(request.url).searchParams.get('X-Plex-Container-Start'),
          )
          return HttpResponse.json(discoverPage(start, 100, 50_000))
        }),
      )

      const promise = fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: true,
        plexUuid: null,
        username: 'owner',
        log,
      })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(calls).toBe(DIAGNOSTICS_MAX_PAGES)
      expect(result.items).toHaveLength(DIAGNOSTICS_MAX_PAGES * 100)
      expect(result.truncated).toBe(true)
    })

    it('honours a smaller explicit page cap', async () => {
      vi.useFakeTimers()
      let calls = 0
      server.use(
        http.get(DISCOVER_URL, ({ request }) => {
          calls++
          const start = Number(
            new URL(request.url).searchParams.get('X-Plex-Container-Start'),
          )
          return HttpResponse.json(discoverPage(start, 100, 1_000))
        }),
      )

      const promise = fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: true,
        plexUuid: null,
        username: 'owner',
        log,
        maxPages: 2,
      })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(calls).toBe(2)
      expect(result.truncated).toBe(true)
    })

    it('waits the polite 5-15s jitter between pages', async () => {
      vi.useFakeTimers()
      let calls = 0
      server.use(
        http.get(DISCOVER_URL, ({ request }) => {
          calls++
          const start = Number(
            new URL(request.url).searchParams.get('X-Plex-Container-Start'),
          )
          return HttpResponse.json(discoverPage(start, 100, 200))
        }),
      )

      const promise = fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: true,
        plexUuid: null,
        username: 'owner',
        log,
      })
      await vi.advanceTimersByTimeAsync(4_900)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(10_200)
      expect(calls).toBe(2)
      await promise
    })

    it('stops paging once the signal aborts', async () => {
      const controller = new AbortController()
      let calls = 0
      server.use(
        http.get(DISCOVER_URL, () => {
          calls++
          controller.abort(new Error('client disconnected'))
          return HttpResponse.json(discoverPage(0, 100, 500))
        }),
      )

      await expect(
        fetchLiveWatchlist({
          tokens: ['token'],
          isPrimary: true,
          plexUuid: null,
          username: 'owner',
          log,
          signal: controller.signal,
        }),
      ).rejects.toThrow('client disconnected')
      expect(calls).toBe(1)
    })

    it('surfaces a Plex error instead of falling back to stored items', async () => {
      server.use(
        http.get(
          DISCOVER_URL,
          () => new HttpResponse(null, { status: 401, statusText: 'Nope' }),
        ),
      )

      await expect(
        fetchLiveWatchlist({
          tokens: ['token'],
          isPrimary: true,
          plexUuid: null,
          username: 'owner',
          log,
        }),
      ).rejects.toThrow('HTTP 401')
    })

    it('rejects when no token is configured', async () => {
      await expect(
        fetchLiveWatchlist({
          tokens: [],
          isPrimary: true,
          plexUuid: null,
          username: 'owner',
          log,
        }),
      ).rejects.toThrow('No Plex token configured')
    })
  })

  describe('friend watchlist (GraphQL)', () => {
    it("fetches the friend's watchlist by Plex UUID", async () => {
      let variables: { user: { id: string }; first: number } | undefined
      server.use(
        http.post(GRAPHQL_URL, async ({ request }) => {
          const body = (await request.json()) as {
            variables: { user: { id: string }; first: number }
          }
          variables = body.variables
          return HttpResponse.json(graphqlPage(['f1', 'f2'], false, null))
        }),
      )

      const result = await fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: false,
        plexUuid: 'friend-uuid',
        username: 'friend',
        log,
      })

      expect(variables).toEqual({
        user: { id: 'friend-uuid' },
        first: 100,
        after: null,
      })
      expect(result).toEqual({
        source: 'friend',
        truncated: false,
        items: [
          { key: 'f1', title: 'Friend f1', type: 'show' },
          { key: 'f2', title: 'Friend f2', type: 'show' },
        ],
      })
    })

    it('stops at the page cap and flags truncation', async () => {
      vi.useFakeTimers()
      let calls = 0
      server.use(
        http.post(GRAPHQL_URL, () => {
          calls++
          return HttpResponse.json(
            graphqlPage([`f${calls}`], true, `cursor-${calls}`),
          )
        }),
      )

      const promise = fetchLiveWatchlist({
        tokens: ['token'],
        isPrimary: false,
        plexUuid: 'friend-uuid',
        username: 'friend',
        log,
        maxPages: 3,
      })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(calls).toBe(3)
      expect(result.items.map((i) => i.key)).toEqual(['f1', 'f2', 'f3'])
      expect(result.truncated).toBe(true)
    })

    it('tries the next configured token when the first cannot see the friend', async () => {
      const seen: string[] = []
      server.use(
        http.post(GRAPHQL_URL, ({ request }) => {
          const token = request.headers.get('X-Plex-Token') ?? ''
          seen.push(token)
          if (token === 'token-a') {
            return new HttpResponse(null, { status: 403 })
          }
          return HttpResponse.json(graphqlPage(['f1'], false, null))
        }),
      )

      const result = await fetchLiveWatchlist({
        tokens: ['token-a', 'token-b'],
        isPrimary: false,
        plexUuid: 'friend-uuid',
        username: 'friend',
        log,
      })

      expect(seen).toEqual(['token-a', 'token-b'])
      expect(result.items).toHaveLength(1)
    })

    it('throws the last error when no token can fetch the watchlist', async () => {
      server.use(
        http.post(GRAPHQL_URL, () => new HttpResponse(null, { status: 403 })),
      )

      await expect(
        fetchLiveWatchlist({
          tokens: ['token-a', 'token-b'],
          isPrimary: false,
          plexUuid: 'friend-uuid',
          username: 'friend',
          log,
        }),
      ).rejects.toThrow('HTTP 403')
    })

    it('aborts an in-flight request and does not try other tokens', async () => {
      const controller = new AbortController()
      let calls = 0
      server.use(
        http.post(GRAPHQL_URL, async () => {
          calls++
          controller.abort(new Error('client disconnected'))
          return HttpResponse.json(graphqlPage(['f1'], true, 'c1'))
        }),
      )

      await expect(
        fetchLiveWatchlist({
          tokens: ['token-a', 'token-b'],
          isPrimary: false,
          plexUuid: 'friend-uuid',
          username: 'friend',
          log,
          signal: controller.signal,
        }),
      ).rejects.toThrow('client disconnected')
      expect(calls).toBe(1)
    })

    it('rejects a friend without a Plex UUID before calling Plex', async () => {
      let calls = 0
      server.use(
        http.post(GRAPHQL_URL, () => {
          calls++
          return HttpResponse.json(graphqlPage([], false, null))
        }),
      )

      await expect(
        fetchLiveWatchlist({
          tokens: ['token'],
          isPrimary: false,
          plexUuid: null,
          username: 'friend',
          log,
        }),
      ).rejects.toThrow('User has no Plex UUID')
      expect(calls).toBe(0)
    })
  })
})
