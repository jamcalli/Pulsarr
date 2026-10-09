import type { RouteContentResult } from '@services/watchlist-workflow/routing/content-router.js'
import {
  clearRoutingFailures,
  type FailureTarget,
  failuresFromResult,
  persistRoutingFailures,
  trackRouting,
} from '@services/watchlist-workflow/routing/failure-tracker.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

const target: FailureTarget = {
  userId: 7,
  key: 'movie-key',
  title: 'Movie',
  contentType: 'movie',
}

describe('failuresFromResult', () => {
  it('records a missing id as low-severity missing_ids', () => {
    expect(
      failuresFromResult(
        { routed: false, skippedReason: 'no-valid-id' },
        'show',
      ),
    ).toEqual([
      {
        category: 'missing_ids',
        message: 'No TVDB ID, so Sonarr cannot add it',
      },
    ])
  })

  it('records no target as no_route', () => {
    expect(
      failuresFromResult(
        { routed: false, skippedReason: 'no-target' },
        'movie',
      ),
    ).toEqual([expect.objectContaining({ category: 'no_route' })])
  })

  it('records an unchecked instance as instance_unavailable', () => {
    expect(
      failuresFromResult(
        { routed: false, skippedReason: 'no-instances-available' },
        'movie',
      ),
    ).toEqual([expect.objectContaining({ category: 'instance_unavailable' })])
  })

  it('passes through per-instance add failures', () => {
    const failures = [
      { category: 'arr_error' as const, message: 'bad', instanceId: 2 },
    ]
    expect(failuresFromResult({ routed: true, failures }, 'movie')).toBe(
      failures,
    )
  })

  it.each([
    'excluded',
    'default-skip',
    'exists-in-target',
    'exists-on-plex',
  ] as const)('treats %s as a deliberate skip with no failure', (reason) => {
    expect(
      failuresFromResult({ routed: false, skippedReason: reason }, 'movie'),
    ).toEqual([])
  })

  it('treats a clean routed result as no failure', () => {
    expect(failuresFromResult({ routed: true }, 'movie')).toEqual([])
  })

  it('treats a gate block (approval or quota) as no failure', () => {
    expect(failuresFromResult({ routed: false }, 'movie')).toEqual([])
  })
})

describe('failure persistence', () => {
  const makeDb = () => ({
    setRoutingFailures: vi.fn(async () => true),
    clearRoutingFailures: vi.fn(async () => 1),
  })
  let deps: ContentRoutingDeps
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
    deps = createWorkflowDeps({ db })
  })

  it('writes failures for the item', async () => {
    const failures = [{ category: 'no_route' as const, message: 'none' }]
    await persistRoutingFailures(target, failures, deps)
    expect(db.setRoutingFailures).toHaveBeenCalledWith(7, 'movie-key', failures)
  })

  it('clears the item when there are no failures', async () => {
    await persistRoutingFailures(target, [], deps)
    expect(db.clearRoutingFailures).toHaveBeenCalledWith(7, 'movie-key')
    expect(db.setRoutingFailures).not.toHaveBeenCalled()
  })

  it('skips the clear for an item the index says has no failure', async () => {
    await clearRoutingFailures(
      { ...target, routingFailureKeys: new Set(['7:other-key']) },
      deps,
    )
    expect(db.clearRoutingFailures).not.toHaveBeenCalled()
  })

  it('clears an item listed in the index', async () => {
    await clearRoutingFailures(
      { ...target, routingFailureKeys: new Set(['7:movie-key']) },
      deps,
    )
    expect(db.clearRoutingFailures).toHaveBeenCalledWith(7, 'movie-key')
  })

  it('still writes a new failure for an item missing from the index', async () => {
    await persistRoutingFailures(
      { ...target, routingFailureKeys: new Set() },
      [{ category: 'arr_error', message: 'bad', instanceId: 1 }],
      deps,
    )
    expect(db.setRoutingFailures).toHaveBeenCalledTimes(1)
  })

  it('logs and swallows a database error', async () => {
    db.setRoutingFailures.mockRejectedValue(new Error('locked'))
    await expect(
      persistRoutingFailures(
        target,
        [{ category: 'no_route', message: 'none' }],
        deps,
      ),
    ).resolves.toBeUndefined()
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  it('logs and swallows a database error on clear', async () => {
    db.clearRoutingFailures.mockRejectedValue(new Error('locked'))
    await expect(clearRoutingFailures(target, deps)).resolves.toBeUndefined()
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  describe('trackRouting', () => {
    it('records the failures of a routing result and returns it', async () => {
      const result: RouteContentResult = {
        routed: false,
        skippedReason: 'no-target',
      }
      expect(await trackRouting(target, async () => result, deps)).toBe(result)
      expect(db.setRoutingFailures).toHaveBeenCalledWith(7, 'movie-key', [
        expect.objectContaining({ category: 'no_route' }),
      ])
    })

    it('clears earlier failures on success', async () => {
      await trackRouting(target, async () => ({ routed: true }), deps)
      expect(db.clearRoutingFailures).toHaveBeenCalledWith(7, 'movie-key')
    })

    it('records a thrown error as routing_error and rethrows it', async () => {
      const error = new Error('rules unreadable')
      await expect(
        trackRouting(
          target,
          async () => {
            throw error
          },
          deps,
        ),
      ).rejects.toBe(error)
      expect(db.setRoutingFailures).toHaveBeenCalledWith(7, 'movie-key', [
        { category: 'routing_error', message: 'rules unreadable' },
      ])
    })

    it('returns the routing result even when recording fails', async () => {
      db.clearRoutingFailures.mockRejectedValue(new Error('locked'))
      expect(
        await trackRouting(target, async () => ({ routed: true }), deps),
      ).toEqual({
        routed: true,
      })
    })
  })
})
