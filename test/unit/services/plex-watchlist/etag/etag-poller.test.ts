import type { Config } from '@root/types/config.types.js'
import type { EtagPollResult, EtagUserInfo } from '@root/types/plex.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('EtagPoller staggered loop restart', () => {
  const SLOT_MS = (5 * 60 * 1000) / 2

  function unchanged(user: EtagUserInfo): EtagPollResult {
    return {
      changed: false,
      userId: user.userId,
      isPrimary: user.isPrimary,
      newItems: [],
    }
  }

  function createPoller() {
    const poller = new EtagPoller(
      () => ({ plexTokens: ['token'] }) as Config,
      createMockLogger(),
    )
    const checkedAt: number[] = []
    const checkUser = vi
      .spyOn(poller, 'checkUser')
      .mockImplementation(async (user) => {
        checkedAt.push(Date.now())
        return unchanged(user)
      })
    return { poller, checkedAt, checkUser }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('runs a single loop when restarted while the old loop has a check in flight', async () => {
    const { poller, checkedAt, checkUser } = createPoller()
    let release: () => void = () => {}
    checkUser.mockImplementationOnce(
      (user) =>
        new Promise((resolve) => {
          checkedAt.push(Date.now())
          release = () => resolve(unchanged(user))
        }),
    )
    const onCycleStart = vi.fn(async () => [])

    poller.startStaggeredPolling(1, [], vi.fn(), onCycleStart)
    await vi.advanceTimersByTimeAsync(SLOT_MS)
    expect(checkUser).toHaveBeenCalledTimes(1)

    poller.stopStaggeredPolling()
    poller.startStaggeredPolling(1, [], vi.fn(), onCycleStart)
    await vi.advanceTimersByTimeAsync(0)
    const cycleStartsBeforeRelease = onCycleStart.mock.calls.length
    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(onCycleStart).toHaveBeenCalledTimes(cycleStartsBeforeRelease)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(2 * SLOT_MS)
    expect(checkedAt).toEqual([SLOT_MS, 2 * SLOT_MS, 3 * SLOT_MS])
    expect(vi.getTimerCount()).toBe(1)

    poller.stopStaggeredPolling()
  })

  it('drops the result of a check that finishes after a restart', async () => {
    const { poller, checkUser } = createPoller()
    let release: () => void = () => {}
    checkUser.mockImplementationOnce(
      (user) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              changed: true,
              userId: user.userId,
              isPrimary: user.isPrimary,
              newItems: [{ id: 'new', title: 'New', type: 'movie' }],
            })
        }),
    )
    const staleOnUserChanged = vi.fn().mockResolvedValue(undefined)
    const onUserChanged = vi.fn().mockResolvedValue(undefined)

    poller.startStaggeredPolling(1, [], staleOnUserChanged, async () => [])
    await vi.advanceTimersByTimeAsync(SLOT_MS)
    expect(checkUser).toHaveBeenCalledTimes(1)

    poller.stopStaggeredPolling()
    poller.startStaggeredPolling(1, [], onUserChanged, async () => [])
    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(staleOnUserChanged).not.toHaveBeenCalled()
    expect(onUserChanged).not.toHaveBeenCalled()

    poller.stopStaggeredPolling()
  })
})
