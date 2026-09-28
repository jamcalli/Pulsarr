import type { User } from '@root/types/config.types.js'
import type { CachedRssItem, Item } from '@root/types/plex.types.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/plex-watchlist/index.js', () => ({
  processItemsForUser: vi.fn(async () => ({
    brandNewCount: 0,
    linkedCount: 0,
    processedItems: [],
    linkedItems: [],
  })),
}))

vi.mock('@services/watchlist-workflow/routing/health-checker.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
  queueForDeferredRouting: vi.fn(() => true),
}))

vi.mock('@services/watchlist-workflow/routing/item-router.js', () => ({
  routeEnrichedItemsForUser: vi.fn(async () => {}),
}))

vi.mock(
  '@services/watchlist-workflow/attribution/approval-attributor.js',
  () => ({
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
  }),
)

vi.mock('@services/watchlist-workflow/rss/enricher.js', () => ({
  enrichRssItems: vi.fn(async (): Promise<Item[]> => []),
}))

import { processItemsForUser } from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '@services/watchlist-workflow/attribution/approval-attributor.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '@services/watchlist-workflow/routing/health-checker.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'
import { enrichRssItems } from '@services/watchlist-workflow/rss/enricher.js'
import { processRssSelfItems } from '@services/watchlist-workflow/rss/self-processor.js'

const PRIMARY_USER = createMockUser(1, 'primary')

function rssItem(stableKey: string): CachedRssItem {
  return {
    stableKey,
    title: stableKey,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: ['Drama'],
    author: 'uuid-primary',
  }
}

function enriched(key: string, userId: number): Item {
  return {
    title: key,
    key,
    type: 'MOVIE',
    thumb: 'thumb.jpg',
    guids: ['tmdb:1'],
    genres: ['Drama'],
    user_id: userId,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function processedResult(processed: Item[], linked: Item[]) {
  return {
    brandNewCount: processed.length,
    linkedCount: linked.length,
    processedItems: processed,
    linkedItems: linked,
  }
}

function createDeps() {
  const services = {
    db: {
      getPrimaryUser: vi.fn(
        async (): Promise<User | undefined> => PRIMARY_USER,
      ),
    },
  }

  const deps = createWorkflowDeps({
    ...services,
    config: { skipIfExistsOnPlex: false },
    state: { deferredRoutingQueue: { enqueue: vi.fn() } },
  })

  const parts = {
    ...services,
    scheduleDebouncedStatusSync: vi
      .spyOn(deps.state, 'scheduleDebouncedStatusSync')
      .mockImplementation(() => {}),
  }

  return { deps, parts }
}

describe('processRssSelfItems', () => {
  let deps: WorkflowDeps
  let parts: ReturnType<typeof createDeps>['parts']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })
    vi.mocked(enrichRssItems).mockResolvedValue([])
    vi.mocked(processItemsForUser).mockResolvedValue(processedResult([], []))

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('stops when there is no primary user', async () => {
    parts.db.getPrimaryUser.mockResolvedValue(undefined)

    await processRssSelfItems([rssItem('a')], deps)

    expect(checkInstanceHealth).not.toHaveBeenCalled()
    expect(enrichRssItems).not.toHaveBeenCalled()
  })

  it('stops when nothing enriches', async () => {
    await processRssSelfItems([rssItem('a')], deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
  })

  it('processes and routes enriched items', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])
    const processed = enriched('processed', PRIMARY_USER.id)
    const linked = enriched('linked', PRIMARY_USER.id)
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([processed], [linked]),
    )

    await processRssSelfItems([rssItem('a')], deps)

    expect(vi.mocked(processItemsForUser).mock.calls[0][0]).toEqual({
      user: {
        userId: PRIMARY_USER.id,
        username: PRIMARY_USER.name,
        watchlistId: '',
      },
      items: [
        expect.objectContaining({
          id: 'rk-1',
          key: 'rk-1',
          type: 'movie',
          user_id: PRIMARY_USER.id,
          status: 'pending',
        }),
      ],
      isSelfWatchlist: true,
    })
    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      PRIMARY_USER.id,
      [processed, linked],
      deps,
    )
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
  })

  it('queues for deferred routing when instances are unavailable', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])
    const processed = enriched('processed', PRIMARY_USER.id)
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([processed], []),
    )
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await processRssSelfItems([rssItem('a')], deps)

    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][1]).toEqual({
      type: 'items',
      userId: PRIMARY_USER.id,
      items: [processed],
    })
    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][2]).toBe('rss-self')
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('stays cancelled when a new run opens during processing', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])
    vi.mocked(processItemsForUser).mockImplementation(async () => {
      deps.state.endRun()
      deps.state.beginRun()
      return processedResult([enriched('processed', PRIMARY_USER.id)], [])
    })

    await processRssSelfItems([rssItem('a')], deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(queueForDeferredRouting).not.toHaveBeenCalled()
    expect(updateAutoApprovalUserAttribution).not.toHaveBeenCalled()
  })

  it('skips post-routing tasks when the run ends during routing', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([enriched('processed', PRIMARY_USER.id)], []),
    )
    vi.mocked(routeEnrichedItemsForUser).mockImplementationOnce(async () => {
      deps.state.endRun()
    })

    await processRssSelfItems([rssItem('a')], deps)

    expect(updateAutoApprovalUserAttribution).not.toHaveBeenCalled()
    expect(parts.scheduleDebouncedStatusSync).not.toHaveBeenCalled()
  })

  it('neither routes nor queues when processing yields nothing', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])

    await processRssSelfItems([rssItem('a')], deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(queueForDeferredRouting).not.toHaveBeenCalled()
  })
})
