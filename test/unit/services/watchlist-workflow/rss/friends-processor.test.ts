import type { CachedRssItem, Item } from '@root/types/plex.types.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
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
import { processRssFriendsItems } from '@services/watchlist-workflow/rss/friends-processor.js'

const USERS = new Map([
  ['uuid-a', { id: 10, name: 'friend-a' }],
  ['uuid-b', { id: 11, name: 'friend-b' }],
])

function rssItem(stableKey: string, author: string): CachedRssItem {
  return {
    stableKey,
    title: stableKey,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: ['Drama'],
    author,
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
  const state = new WorkflowState()
  state.deferredRoutingQueue = { enqueue: vi.fn() } as unknown as NonNullable<
    WorkflowState['deferredRoutingQueue']
  >

  const parts = {
    db: {
      getUser: vi.fn(
        async (
          userId: number,
        ): Promise<{ id: number; name: string } | undefined> =>
          [...USERS.values()].find((user) => user.id === userId),
      ),
    },
    lookupUserByUuid: vi
      .spyOn(state, 'lookupUserByUuid')
      .mockImplementation(async (uuid: string) => USERS.get(uuid)?.id ?? null),
    scheduleDebouncedStatusSync: vi
      .spyOn(state, 'scheduleDebouncedStatusSync')
      .mockImplementation(() => {}),
  }

  const deps = {
    ...parts,
    state,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false },
    fastify: { plexServerService: {} },
    sonarrManager: {},
    radarrManager: {},
    itemProcessorDeps: {},
  } as unknown as WorkflowDeps

  return { deps, parts }
}

describe('processRssFriendsItems', () => {
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
    vi.mocked(enrichRssItems).mockImplementation(async (items, userId) =>
      items.map((item) => enriched(item.stableKey, userId)),
    )
    vi.mocked(processItemsForUser).mockImplementation(async (input) =>
      processedResult(input.items as Item[], []),
    )

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('processes each author separately and runs post-routing tasks once', async () => {
    await processRssFriendsItems(
      [rssItem('a1', 'uuid-a'), rssItem('b1', 'uuid-b')],
      deps,
    )

    expect(processItemsForUser).toHaveBeenCalledTimes(2)
    expect(vi.mocked(processItemsForUser).mock.calls[0][0]).toMatchObject({
      user: { userId: 10, username: 'friend-a', watchlistId: '' },
      isSelfWatchlist: false,
    })
    expect(vi.mocked(processItemsForUser).mock.calls[1][0]).toMatchObject({
      user: { userId: 11, username: 'friend-b', watchlistId: '' },
      isSelfWatchlist: false,
    })
    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(2)
    expect(routeEnrichedItemsForUser).toHaveBeenNthCalledWith(
      1,
      10,
      [expect.objectContaining({ key: 'a1', user_id: 10 })],
      deps,
    )
    expect(routeEnrichedItemsForUser).toHaveBeenNthCalledWith(
      2,
      11,
      [expect.objectContaining({ key: 'b1', user_id: 11 })],
      deps,
    )
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
  })

  it('skips an author that maps to no user', async () => {
    await processRssFriendsItems(
      [rssItem('x1', 'uuid-unknown'), rssItem('a1', 'uuid-a')],
      deps,
    )

    expect(processItemsForUser).toHaveBeenCalledTimes(1)
    expect(vi.mocked(processItemsForUser).mock.calls[0][0]).toMatchObject({
      user: { userId: 10 },
    })
  })

  it('skips an author whose user row is missing', async () => {
    parts.db.getUser.mockResolvedValue(undefined)

    await processRssFriendsItems([rssItem('a1', 'uuid-a')], deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('ignores items with no author but still finishes', async () => {
    await processRssFriendsItems([rssItem('orphan', '')], deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
  })

  it('queues each author when instances are unavailable', async () => {
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await processRssFriendsItems(
      [rssItem('a1', 'uuid-a'), rssItem('b1', 'uuid-b')],
      deps,
    )

    expect(queueForDeferredRouting).toHaveBeenCalledTimes(2)
    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][1]).toMatchObject({
      type: 'items',
      userId: 10,
    })
    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][2]).toBe(
      'rss-friends',
    )
    expect(vi.mocked(queueForDeferredRouting).mock.calls[1][1]).toMatchObject({
      type: 'items',
      userId: 11,
    })
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('runs the post-routing tasks on an empty feed', async () => {
    await processRssFriendsItems([], deps)

    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
  })
})
