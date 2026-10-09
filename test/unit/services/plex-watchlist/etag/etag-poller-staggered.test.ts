import type { Config } from '@root/types/config.types.js'
import type { EtagPollResult, EtagUserInfo } from '@root/types/plex.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const MINUTE = 60 * 1000
const ETAG_CYCLE_MS = 5 * MINUTE

function friend(userId: number): EtagUserInfo {
  return {
    userId,
    username: `friend-${userId}`,
    watchlistId: `wl-${userId}`,
    isPrimary: false,
  }
}

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
  const checked: { userId: number; at: number }[] = []
  const checkUser = vi
    .spyOn(poller, 'checkUser')
    .mockImplementation(async (user) => {
      checked.push({ userId: user.userId, at: Date.now() })
      return unchanged(user)
    })
  return { poller, checked, checkUser }
}

/** Gaps between consecutive checks of the same user */
function gapsFor(checked: { userId: number; at: number }[], userId: number) {
  const times = checked.filter((c) => c.userId === userId).map((c) => c.at)
  return times.slice(1).map((t, i) => t - times[i])
}

describe('EtagPoller staggered polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('custom cycle', () => {
    it('checks each user once per cycle, staggered evenly across it', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // zero jitter
      const { poller, checked } = createPoller()
      const friends = [friend(2), friend(3)]

      poller.startStaggeredPolling(1, friends, vi.fn(), async () => friends, {
        getCycleMs: () => 30 * MINUTE,
      })

      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1)
      expect(checked).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(1)
      expect(checked.map((c) => c.userId)).toEqual([1])

      await vi.advanceTimersByTimeAsync(20 * MINUTE)
      expect(checked.map((c) => c.userId)).toEqual([1, 2, 3])

      await vi.advanceTimersByTimeAsync(60 * MINUTE)
      for (const userId of [1, 2, 3]) {
        expect(gapsFor(checked, userId)).toEqual([30 * MINUTE, 30 * MINUTE])
      }
      // Stagger: the users never share a slot
      const slots = checked.map((c) => c.at)
      expect(new Set(slots).size).toBe(slots.length)

      poller.stopStaggeredPolling()
    })

    it('keeps every gap within ±10% jitter of the per-user slot', async () => {
      const { poller, checked } = createPoller()
      const friends = [friend(2), friend(3), friend(4)]
      const slotMs = (40 * MINUTE) / 4

      const onCycleStart = vi.fn(async () => friends)
      poller.startStaggeredPolling(1, friends, vi.fn(), onCycleStart, {
        getCycleMs: () => 40 * MINUTE,
      })

      // Extreme jitter both ways, then real randomness
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.999999)
      await vi.advanceTimersByTimeAsync(200 * MINUTE)

      const times = checked.map((c) => c.at)
      const gaps = times.map((t, i) => t - (i === 0 ? 0 : times[i - 1]))
      expect(gaps.length).toBeGreaterThan(15)
      for (const gap of gaps) {
        expect(gap).toBeGreaterThanOrEqual(slotMs * 0.9 - 1)
        expect(gap).toBeLessThanOrEqual(slotMs * 1.1 + 1)
      }
      expect(gaps[0]).toBeCloseTo(slotMs * 0.9, -1)
      expect(gaps[1]).toBeCloseTo(slotMs * 1.1, -1)

      poller.stopStaggeredPolling()
    })

    it('never checks a user more often than the 5-minute ETag cycle', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checked } = createPoller()

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => MINUTE,
      })

      await vi.advanceTimersByTimeAsync(30 * MINUTE)
      expect(gapsFor(checked, 1).every((gap) => gap === ETAG_CYCLE_MS)).toBe(
        true,
      )
      expect(checked).toHaveLength(6)

      poller.stopStaggeredPolling()
    })

    it('falls back to the ETag cycle when the configured cycle is not a number', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checked } = createPoller()

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => Number.NaN,
      })

      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(checked.map((c) => c.at)).toEqual([
        ETAG_CYCLE_MS,
        2 * ETAG_CYCLE_MS,
      ])

      poller.stopStaggeredPolling()
    })

    it('reads the cycle length live, so an interval change applies on the next slot', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checked } = createPoller()
      let cycleMs = 30 * MINUTE

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => cycleMs,
      })

      await vi.advanceTimersByTimeAsync(30 * MINUTE)
      expect(checked).toHaveLength(1)
      cycleMs = 60 * MINUTE

      // the slot after the check was already armed with the old cycle
      await vi.advanceTimersByTimeAsync(90 * MINUTE)
      expect(gapsFor(checked, 1)).toEqual([30 * MINUTE, 60 * MINUTE])

      poller.stopStaggeredPolling()
    })

    it('refreshes the user list at each cycle start', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checked } = createPoller()
      let friends: EtagUserInfo[] = [friend(2)]
      const onCycleStart = vi.fn(async () => friends)

      poller.startStaggeredPolling(1, friends, vi.fn(), onCycleStart, {
        getCycleMs: () => 20 * MINUTE,
      })

      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(checked.map((c) => c.userId)).toEqual([1])

      friends = [friend(2), friend(3)]
      await vi.advanceTimersByTimeAsync(30 * MINUTE)
      expect(checked.map((c) => c.userId)).toEqual([1, 2, 1, 2, 3])
      // at start, then at each cycle boundary
      expect(onCycleStart).toHaveBeenCalledTimes(3)

      poller.stopStaggeredPolling()
    })
  })

  describe('check gate', () => {
    it('runs every check through runCheck and notifies only changed users', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checkUser } = createPoller()
      const changed: EtagPollResult = {
        changed: true,
        userId: 2,
        isPrimary: false,
        newItems: [{ id: 'k', title: 'T', type: 'movie' }],
      }
      checkUser.mockImplementation(async (user) =>
        user.userId === 2 ? changed : unchanged(user),
      )
      const onUserChanged = vi.fn(async () => {})
      const runCheck = vi.fn(async (check: () => Promise<void>) => check())

      poller.startStaggeredPolling(
        1,
        [friend(2)],
        onUserChanged,
        async () => [friend(2)],
        { getCycleMs: () => 20 * MINUTE, runCheck },
      )

      await vi.advanceTimersByTimeAsync(20 * MINUTE)
      expect(runCheck).toHaveBeenCalledTimes(2)
      expect(checkUser).toHaveBeenCalledTimes(2)
      expect(onUserChanged).toHaveBeenCalledTimes(1)
      expect(onUserChanged).toHaveBeenCalledWith(changed)

      poller.stopStaggeredPolling()
    })

    it('skips the request entirely when the gate declines, and keeps the loop going', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checkUser } = createPoller()
      let open = false
      const runCheck = vi.fn(async (check: () => Promise<void>) => {
        if (open) await check()
      })

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
        runCheck,
      })

      await vi.advanceTimersByTimeAsync(20 * MINUTE)
      expect(runCheck).toHaveBeenCalledTimes(2)
      expect(checkUser).not.toHaveBeenCalled()

      open = true
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(checkUser).toHaveBeenCalledTimes(1)

      poller.stopStaggeredPolling()
    })

    it('keeps polling after a check throws', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checkUser } = createPoller()
      checkUser.mockRejectedValueOnce(new Error('boom'))

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
      })

      await vi.advanceTimersByTimeAsync(20 * MINUTE)
      expect(checkUser).toHaveBeenCalledTimes(2)

      poller.stopStaggeredPolling()
    })
  })

  describe('stop and restart', () => {
    it('schedules nothing after stop', async () => {
      const { poller, checkUser } = createPoller()

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
      })
      poller.stopStaggeredPolling()

      await vi.advanceTimersByTimeAsync(60 * MINUTE)
      expect(checkUser).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('does not re-arm when stopped while a check is in flight', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checkUser } = createPoller()
      let release: () => void = () => {}
      checkUser.mockImplementationOnce(
        (user) =>
          new Promise((resolve) => {
            release = () => resolve(unchanged(user))
          }),
      )

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
      })
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(checkUser).toHaveBeenCalledTimes(1)

      poller.stopStaggeredPolling()
      release()
      await vi.advanceTimersByTimeAsync(60 * MINUTE)

      expect(checkUser).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('runs a single loop when restarted while the old loop has a check in flight', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checkUser, checked } = createPoller()
      let release: () => void = () => {}
      checkUser.mockImplementationOnce(
        (user) =>
          new Promise((resolve) => {
            release = () => resolve(unchanged(user))
          }),
      )

      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
      })
      await vi.advanceTimersByTimeAsync(10 * MINUTE)

      poller.stopStaggeredPolling()
      poller.startStaggeredPolling(1, [], vi.fn(), async () => [], {
        getCycleMs: () => 10 * MINUTE,
      })
      release()

      await vi.advanceTimersByTimeAsync(30 * MINUTE)
      // the new loop alone checks once per 10 minutes
      expect(checked.map((c) => c.at)).toEqual([
        20 * MINUTE,
        30 * MINUTE,
        40 * MINUTE,
      ])
      expect(vi.getTimerCount()).toBe(1)

      poller.stopStaggeredPolling()
    })
  })

  describe('ETag mode defaults', () => {
    it('keeps the (users + 1) spacing of the 5-minute cycle when no options are passed', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const { poller, checked } = createPoller()
      const friends = [friend(2)]

      poller.startStaggeredPolling(1, friends, vi.fn(), async () => friends)

      await vi.advanceTimersByTimeAsync(ETAG_CYCLE_MS)
      const slotMs = ETAG_CYCLE_MS / 3
      expect(checked.map((c) => c.at)).toEqual([slotMs, 2 * slotMs, 3 * slotMs])
      expect(checked.map((c) => c.userId)).toEqual([1, 2, 1])

      poller.stopStaggeredPolling()
    })

    it('drops the result of a check that finishes after stop, as before the safety net', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
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
      const onUserChanged = vi.fn().mockResolvedValue(undefined)

      poller.startStaggeredPolling(1, [], onUserChanged, async () => [])
      await vi.advanceTimersByTimeAsync(ETAG_CYCLE_MS / 2)
      expect(checkUser).toHaveBeenCalledTimes(1)

      poller.stopStaggeredPolling()
      release()
      await vi.advanceTimersByTimeAsync(0)

      expect(onUserChanged).not.toHaveBeenCalled()
    })
  })
})
