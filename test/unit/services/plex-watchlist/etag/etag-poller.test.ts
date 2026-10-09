import type { Config } from '@root/types/config.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const WATCHLIST_URL =
  'https://discover.provider.plex.tv/library/sections/watchlist/all'

function captureTokens(conditional: boolean[] = []): string[] {
  const tokens: string[] = []
  server.use(
    http.get(WATCHLIST_URL, ({ request }) => {
      tokens.push(request.headers.get('X-Plex-Token') ?? '')
      conditional.push(request.headers.has('If-None-Match'))
      return HttpResponse.json(
        { MediaContainer: { Metadata: [] } },
        { headers: { etag: 'W/"1"' } },
      )
    }),
  )
  return tokens
}

describe('EtagPoller config access', () => {
  it('reads the token from the current config on every call', async () => {
    let config = { plexTokens: ['token-old'] } as Config
    const poller = new EtagPoller(() => config, createMockLogger())
    const tokens = captureTokens()

    await poller.establishBaseline({
      userId: 1,
      username: 'primary',
      isPrimary: true,
    })
    config = { plexTokens: ['token-new'] } as Config
    poller.clearCache()
    await poller.establishBaseline({
      userId: 1,
      username: 'primary',
      isPrimary: true,
    })

    expect(tokens).toEqual(['token-old', 'token-new'])
  })

  it('discards baselines when the token changes so the new account is re-baselined', async () => {
    let config = { plexTokens: ['token-old'] } as Config
    const poller = new EtagPoller(() => config, createMockLogger())
    const conditional: boolean[] = []
    const tokens = captureTokens(conditional)
    const primary = { userId: 1, username: 'primary', isPrimary: true }

    await poller.establishBaseline(primary)
    expect(poller.getCache().has('primary:1')).toBe(true)

    config = { plexTokens: ['token-new'] } as Config
    const result = await poller.checkUser(primary)

    expect(result.changed).toBe(false)
    expect(tokens).toEqual(['token-old', 'token-new'])
    expect(conditional).toEqual([false, false])
  })

  it('discards bulk baselines when the token changes before the first bulk check', async () => {
    let config = { plexTokens: ['token-old'] } as Config
    const poller = new EtagPoller(() => config, createMockLogger())
    const conditional: boolean[] = []
    const tokens = captureTokens(conditional)

    await poller.establishAllBaselines(1, [])
    expect(poller.getCache().has('primary:1')).toBe(true)

    config = { plexTokens: ['token-new'] } as Config
    const results = await poller.checkAllEtags(1, [])

    expect(results).toEqual([])
    expect(tokens).toEqual(['token-old', 'token-new'])
    expect(conditional).toEqual([false, false])
  })

  it('skips the baseline while no token is configured, then proceeds once one is set', async () => {
    let config = { plexTokens: [] as string[] } as Config
    const poller = new EtagPoller(() => config, createMockLogger())
    const tokens = captureTokens()

    await poller.establishBaseline({
      userId: 1,
      username: 'primary',
      isPrimary: true,
    })
    expect(tokens).toEqual([])

    config = { plexTokens: ['token-new'] } as Config
    await poller.establishBaseline({
      userId: 1,
      username: 'primary',
      isPrimary: true,
    })
    expect(tokens).toEqual(['token-new'])
  })
})

// The RSS safety net's Plex load is exactly what one checkUser call costs
describe('EtagPoller per-check request cost', () => {
  const GRAPHQL_URL = 'https://community.plex.tv/api'

  function countRequests(state: { friendEtag: string; primaryEtag: string }) {
    const requests: string[] = []
    server.use(
      http.get(WATCHLIST_URL, ({ request }) => {
        const etag = state.primaryEtag
        if (request.headers.get('If-None-Match') === etag) {
          requests.push('primary:304')
          return new HttpResponse(null, { status: 304 })
        }
        requests.push('primary:200')
        return HttpResponse.json(
          { MediaContainer: { Metadata: [] } },
          { headers: { etag } },
        )
      }),
      http.post(GRAPHQL_URL, async ({ request }) => {
        const body = (await request.json()) as { query: string }
        const size = /watchlist\(first: (\d+)\)/.exec(body.query)?.[1]
        requests.push(`friend:first=${size}`)
        return HttpResponse.json(
          { data: { userV2: { watchlist: { nodes: [] } } } },
          { headers: { etag: state.friendEtag } },
        )
      }),
    )
    return requests
  }

  const primary = { userId: 1, username: 'primary', isPrimary: true }
  const friend = {
    userId: 2,
    username: 'friend',
    watchlistId: 'wl-2',
    isPrimary: false,
  }

  it('costs one conditional request for an unchanged primary watchlist', async () => {
    const poller = new EtagPoller(
      () => ({ plexTokens: ['t'] }) as Config,
      createMockLogger(),
    )
    const requests = countRequests({ primaryEtag: 'W/"1"', friendEtag: '' })
    await poller.establishBaseline(primary)
    requests.length = 0

    await poller.checkUser(primary)

    expect(requests).toEqual(['primary:304'])
  })

  it('costs one 2-item query for an unchanged friend, two requests when changed', async () => {
    const poller = new EtagPoller(
      () => ({ plexTokens: ['t'] }) as Config,
      createMockLogger(),
    )
    const state = { primaryEtag: '', friendEtag: 'W/"a"' }
    const requests = countRequests(state)
    await poller.establishBaseline(friend)
    expect(requests).toEqual(['friend:first=50', 'friend:first=2'])
    requests.length = 0

    await poller.checkUser(friend)
    expect(requests).toEqual(['friend:first=2'])
    requests.length = 0

    state.friendEtag = 'W/"b"'
    await poller.checkUser(friend)
    expect(requests).toEqual(['friend:first=2', 'friend:first=50'])
  })
})
