import type { EtagPollResult, Item } from '@root/types/plex.types.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/routing/content-router.js', () => ({
  routeMovie: vi.fn(async () => ({ routed: true })),
  routeShow: vi.fn(async () => ({ routed: true })),
}))

import {
  routeMovie,
  routeShow,
} from '@services/watchlist-workflow/routing/content-router.js'
import {
  routeEnrichedItemsForUser,
  routeNewItemsForUser,
  routeSingleItem,
} from '@services/watchlist-workflow/routing/item-router.js'

const USER_ID = 7
const USER = createMockUser(USER_ID, 'Tester')
const PRIMARY_USER = createMockUser(1)

function movieItem(key: string, title: string): Item {
  return {
    title,
    key,
    type: 'movie',
    guids: ['tmdb:12345'],
    genres: [],
    user_id: USER_ID,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('routeEnrichedItemsForUser exclusion gate', () => {
  let exclusionMap: Map<string, Set<number>>
  let deps: ContentRoutingDeps

  beforeEach(() => {
    exclusionMap = new Map()

    deps = createWorkflowDeps({
      db: {
        getUser: vi.fn(async () => USER),
        getPrimaryUser: vi.fn(async () => PRIMARY_USER),
        getExclusionMap: vi.fn(async () => exclusionMap),
      },
    })
  })

  it('routes items when there are no exclusions', async () => {
    await routeEnrichedItemsForUser(USER_ID, [movieItem('a', 'A')], deps)

    expect(routeMovie).toHaveBeenCalledTimes(1)
  })

  it('skips items the user has excluded but routes the rest', async () => {
    exclusionMap.set('excluded', new Set([USER_ID]))

    await routeEnrichedItemsForUser(
      USER_ID,
      [movieItem('allowed', 'Allowed'), movieItem('excluded', 'Excluded')],
      deps,
    )

    expect(routeMovie).toHaveBeenCalledTimes(1)
    expect(vi.mocked(routeMovie).mock.calls[0][0].tempItem.key).toBe('allowed')
  })

  it('skips items with a global exclusion regardless of user', async () => {
    exclusionMap.set('global', new Set([SYSTEM_USER_ID]))

    await routeEnrichedItemsForUser(
      USER_ID,
      [movieItem('global', 'Global')],
      deps,
    )

    expect(routeMovie).not.toHaveBeenCalled()
    expect(routeShow).not.toHaveBeenCalled()
  })

  it('does not skip when only a different user has the exclusion', async () => {
    exclusionMap.set('other', new Set([USER_ID + 1]))

    await routeEnrichedItemsForUser(
      USER_ID,
      [movieItem('other', 'Other')],
      deps,
    )

    expect(routeMovie).toHaveBeenCalledTimes(1)
  })
})

describe('routing after the run has ended', () => {
  const pollChange: EtagPollResult = {
    changed: true,
    userId: USER_ID,
    isPrimary: false,
    newItems: [{ id: 'rk-1', title: 'New Item', type: 'movie' }],
  }

  it('routeEnrichedItemsForUser touches neither the database nor routing', async () => {
    const getUser = vi.fn(async () => USER)
    const deps = createWorkflowDeps({ aborted: true, db: { getUser } })

    await routeEnrichedItemsForUser(USER_ID, [movieItem('a', 'A')], deps)

    expect(getUser).not.toHaveBeenCalled()
    expect(routeMovie).not.toHaveBeenCalled()
    expect(routeShow).not.toHaveBeenCalled()
  })

  it('routeNewItemsForUser touches neither the database nor routing', async () => {
    const getUser = vi.fn(async () => USER)
    const deps = createWorkflowDeps({ aborted: true, db: { getUser } })

    await routeNewItemsForUser(pollChange, deps)

    expect(getUser).not.toHaveBeenCalled()
    expect(routeMovie).not.toHaveBeenCalled()
    expect(routeShow).not.toHaveBeenCalled()
  })

  it('routeEnrichedItemsForUser stays cancelled when a new run opens during the user lookup', async () => {
    const getPrimaryUser = vi.fn(async () => PRIMARY_USER)
    const deps = createWorkflowDeps({
      db: {
        getUser: vi.fn(async () => {
          deps.state.endRun()
          deps.state.beginRun()
          return USER
        }),
        getPrimaryUser,
      },
    })

    await routeEnrichedItemsForUser(USER_ID, [movieItem('a', 'A')], deps)

    expect(getPrimaryUser).not.toHaveBeenCalled()
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('routeEnrichedItemsForUser stops mid-batch when the run ends', async () => {
    const deps = createWorkflowDeps({
      db: {
        getUser: vi.fn(async () => USER),
        getPrimaryUser: vi.fn(async () => PRIMARY_USER),
        getExclusionMap: vi.fn(async () => new Map()),
      },
    })
    vi.mocked(routeMovie).mockImplementationOnce(async () => {
      deps.state.endRun()
      return { routed: true }
    })

    await routeEnrichedItemsForUser(
      USER_ID,
      [movieItem('a', 'A'), movieItem('b', 'B')],
      deps,
    )

    expect(routeMovie).toHaveBeenCalledTimes(1)
  })

  it('routeNewItemsForUser stays cancelled when a new run opens during the user lookup', async () => {
    const deps = createWorkflowDeps({
      db: {
        getUser: vi.fn(async () => {
          deps.state.endRun()
          deps.state.beginRun()
          return USER
        }),
      },
    })

    await routeNewItemsForUser(pollChange, deps)

    expect(routeMovie).not.toHaveBeenCalled()
    expect(routeShow).not.toHaveBeenCalled()
  })
})

describe('routing failure bookkeeping', () => {
  let exclusionMap: Map<string, Set<number>>
  const makeDb = () => ({
    getUser: vi.fn(async () => USER),
    getPrimaryUser: vi.fn(async () => PRIMARY_USER),
    getExclusionMap: vi.fn(async () => exclusionMap),
    setRoutingFailures: vi.fn(async () => true),
    clearRoutingFailures: vi.fn(async () => 0),
  })
  let db: ReturnType<typeof makeDb>
  let deps: ContentRoutingDeps

  beforeEach(() => {
    vi.mocked(routeMovie).mockClear()
    vi.mocked(routeShow).mockClear()
    exclusionMap = new Map()
    db = makeDb()
    deps = createWorkflowDeps({ db })
  })

  const route = (item: Item) =>
    routeSingleItem(
      { item, userId: USER_ID, userName: 'Tester', primaryUser: null },
      deps,
    )

  it('records a movie with no TMDB ID as missing_ids', async () => {
    expect(await route({ ...movieItem('m', 'M'), guids: ['imdb:tt1'] })).toBe(
      false,
    )

    expect(routeMovie).not.toHaveBeenCalled()
    expect(db.setRoutingFailures).toHaveBeenCalledWith(USER_ID, 'm', [
      {
        category: 'missing_ids',
        message: 'No TMDB ID, so Radarr cannot add it',
      },
    ])
  })

  it('records a show with no TVDB ID as missing_ids', async () => {
    await route({ ...movieItem('s', 'S'), type: 'show', guids: ['tmdb:1'] })

    expect(routeShow).not.toHaveBeenCalled()
    expect(db.setRoutingFailures).toHaveBeenCalledWith(USER_ID, 's', [
      expect.objectContaining({ category: 'missing_ids' }),
    ])
  })

  it('records an item with no GUIDs at all as missing_ids', async () => {
    await route({ ...movieItem('g', 'G'), guids: [] })

    expect(db.setRoutingFailures).toHaveBeenCalledWith(USER_ID, 'g', [
      expect.objectContaining({ category: 'missing_ids' }),
    ])
  })

  it('records nothing for an unknown content type', async () => {
    await route({ ...movieItem('x', 'X'), type: 'episode', guids: [] })

    expect(db.setRoutingFailures).not.toHaveBeenCalled()
  })

  it('clears an earlier failure on an item skipped by exclusion', async () => {
    exclusionMap.set('excluded', new Set([USER_ID]))

    await routeEnrichedItemsForUser(
      USER_ID,
      [movieItem('excluded', 'Excluded')],
      deps,
    )

    expect(routeMovie).not.toHaveBeenCalled()
    expect(db.clearRoutingFailures).toHaveBeenCalledWith(USER_ID, 'excluded')
  })
})
