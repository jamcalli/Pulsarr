import type { EtagPollResult, Item } from '@root/types/plex.types.js'
import type { InstanceHealthResult } from '@root/types/service-result.types.js'
import { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../mocks/watchlist-workflow-deps.js'

const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000

const CHANGE: EtagPollResult = {
  changed: true,
  userId: 1,
  isPrimary: true,
  newItems: [{ id: 'rk-1', title: 'Queued Movie', type: 'movie' }],
}

const ITEM: Item = {
  title: 'Queued Movie',
  key: 'rk-1',
  type: 'movie',
  guids: ['tmdb:1'],
  genres: [],
  user_id: 1,
  status: 'pending',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function healthy() {
  return vi.fn(
    async (): Promise<InstanceHealthResult> => ({
      available: [1],
      unavailable: [],
    }),
  )
}

function createQueue(signal: AbortSignal) {
  const deps = createWorkflowDeps({
    sonarrManager: { checkInstancesHealth: healthy() },
    radarrManager: { checkInstancesHealth: healthy() },
  })

  const callbacks = {
    routeEtagChange: vi.fn(async () => {}),
    routeItemsForUser: vi.fn(async () => {}),
    onDrained: vi.fn(),
  }

  const queue = new DeferredRoutingQueue({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    callbacks,
    signal,
    log: deps.logger,
  })

  return { queue, callbacks }
}

describe('DeferredRoutingQueue drain', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('routes every queued entry and reports the drain', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const controller = new AbortController()
    const { queue, callbacks } = createQueue(controller.signal)

    queue.enqueue({ type: 'etag', change: CHANGE })
    queue.enqueue({ type: 'items', userId: 1, items: [ITEM] })
    queue.start()

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS)

    expect(callbacks.routeEtagChange).toHaveBeenCalledWith(CHANGE)
    expect(callbacks.routeItemsForUser).toHaveBeenCalledWith(1, [ITEM])
    expect(callbacks.onDrained).toHaveBeenCalledTimes(1)
    expect(queue.getQueueSize()).toBe(0)
  })

  it('routes nothing once the run has ended', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const controller = new AbortController()
    const { queue, callbacks } = createQueue(controller.signal)

    queue.enqueue({ type: 'etag', change: CHANGE })
    queue.start()
    controller.abort()

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_INTERVAL_MS)

    expect(callbacks.routeEtagChange).not.toHaveBeenCalled()
    expect(callbacks.routeItemsForUser).not.toHaveBeenCalled()
    expect(callbacks.onDrained).not.toHaveBeenCalled()
  })
})
