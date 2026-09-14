import type { CachedRssItem, Item } from '@root/types/plex.types.js'
import type { RssProcessorDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/plex-watchlist/index.js', () => ({
  processItemsForUser: vi.fn(async () => ({
    brandNewCount: 0,
    linkedCount: 0,
    processedItems: [],
    linkedItems: [],
  })),
}))

vi.mock('@services/watchlist-workflow/routing/index.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
  queueForDeferredRouting: vi.fn(() => true),
  checkHealthAndQueueIfUnavailable: vi.fn(),
  routeMovie: vi.fn(),
  routeShow: vi.fn(),
  routeEnrichedItemsForUser: vi.fn(),
  routeNewItemsForUser: vi.fn(),
  routeSingleItem: vi.fn(),
  hasUserField: vi.fn(),
}))

vi.mock('@services/watchlist-workflow/rss/enricher.js', () => ({
  enrichRssItems: vi.fn(async (): Promise<Item[]> => []),
}))

import { processItemsForUser } from '@services/plex-watchlist/index.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '@services/watchlist-workflow/routing/index.js'
import { enrichRssItems } from '@services/watchlist-workflow/rss/enricher.js'
import { processRssSelfItems } from '@services/watchlist-workflow/rss/self-processor.js'

const PRIMARY_USER = { id: 1, name: 'primary' }

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
  const parts = {
    db: {
      getPrimaryUser: vi.fn(
        async (): Promise<{ id: number; name: string } | null> => PRIMARY_USER,
      ),
    },
    deferredRoutingQueue: { enqueue: vi.fn() },
    routeEnrichedItemsForUser: vi.fn(async () => {}),
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
    scheduleDebouncedStatusSync: vi.fn(),
  }

  const deps = {
    ...parts,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false },
    fastify: { plexServerService: {} },
    sonarrManager: {},
    radarrManager: {},
    itemProcessorDeps: {},
  } as unknown as RssProcessorDeps

  return { deps, parts }
}

describe('processRssSelfItems', () => {
  let deps: RssProcessorDeps
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
    parts.db.getPrimaryUser.mockResolvedValue(null)

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
    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledWith(
      PRIMARY_USER.id,
      [processed, linked],
    )
    expect(parts.updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
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
    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('neither routes nor queues when processing yields nothing', async () => {
    vi.mocked(enrichRssItems).mockResolvedValue([
      enriched('rk-1', PRIMARY_USER.id),
    ])

    await processRssSelfItems([rssItem('a')], deps)

    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(queueForDeferredRouting).not.toHaveBeenCalled()
  })
})
