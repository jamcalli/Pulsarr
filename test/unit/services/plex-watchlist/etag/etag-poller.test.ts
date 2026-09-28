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
