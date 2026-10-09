import type { Item } from '@root/types/plex.types.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/routing/item-router.js', () => ({
  routeEnrichedItemsForUser: vi.fn(async () => {}),
}))

import {
  RETRY_CONCURRENCY,
  retryRoutingFailures,
} from '@services/watchlist-workflow/routing/failure-retry.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'

function item(id: number, userId = 7): Item & { id: number } {
  return {
    id,
    title: `Item ${id}`,
    key: `key-${id}`,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: [],
    user_id: userId,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('retryRoutingFailures', () => {
  let items: Map<number, Item & { id: number }>
  let stillFailing: Set<number>
  let db: Record<string, ReturnType<typeof vi.fn>>
  let deps: ContentRoutingDeps

  beforeEach(() => {
    vi.mocked(routeEnrichedItemsForUser).mockReset()
    vi.mocked(routeEnrichedItemsForUser).mockResolvedValue(undefined)
    items = new Map([1, 2, 3].map((id) => [id, item(id)]))
    stillFailing = new Set()
    db = {
      getWatchlistItemById: vi.fn(async (id: number) => items.get(id)),
      getUser: vi.fn(async (id: number) => createMockUser(id)),
      hasRoutingFailures: vi.fn(async (id: number) => stillFailing.has(id)),
    }
    deps = createWorkflowDeps({ db })
  })

  it('routes each item through the normal per-user path', async () => {
    await retryRoutingFailures([1, 2], deps)

    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(2)
    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      7,
      [items.get(1)],
      deps,
    )
  })

  it('counts resolved and still failing items', async () => {
    stillFailing.add(2)

    expect(await retryRoutingFailures([1, 2, 3], deps)).toEqual({
      attempted: 3,
      resolved: 2,
      stillFailing: 1,
      skipped: 0,
    })
  })

  it('retries a repeated id once', async () => {
    await retryRoutingFailures([1, 1, 1], deps)
    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
  })

  it('skips an item that no longer exists', async () => {
    expect(await retryRoutingFailures([99], deps)).toMatchObject({
      attempted: 0,
      skipped: 1,
    })
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('skips an item whose user has sync disabled', async () => {
    db.getUser.mockResolvedValue({ ...createMockUser(7), can_sync: false })

    expect(await retryRoutingFailures([1], deps)).toMatchObject({ skipped: 1 })
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('skips everything once the workflow run has ended', async () => {
    deps = createWorkflowDeps({ db, aborted: true })

    expect(await retryRoutingFailures([1, 2], deps)).toMatchObject({
      skipped: 2,
    })
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('counts an item whose routing throws as still failing and keeps going', async () => {
    vi.mocked(routeEnrichedItemsForUser).mockImplementation(
      async (_userId, [routed]) => {
        if (routed.key === 'key-1') throw new Error('boom')
      },
    )

    expect(await retryRoutingFailures([1, 2], deps)).toMatchObject({
      resolved: 1,
      stillFailing: 1,
    })
  })

  it.each([1, RETRY_CONCURRENCY])(
    'never runs more than %i items at once',
    async (concurrency) => {
      const ids = Array.from({ length: 10 }, (_, i) => i + 1)
      for (const id of ids) items.set(id, item(id))
      let running = 0
      let peak = 0
      vi.mocked(routeEnrichedItemsForUser).mockImplementation(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running--
      })

      const result = await retryRoutingFailures(ids, deps, concurrency)

      expect(peak).toBe(concurrency)
      expect(result.attempted).toBe(10)
    },
  )
})
