import type { Item } from '@root/types/plex.types.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/watchlist-workflow/routing/content-router.js', () => ({
  routeMovie: vi.fn(async () => ({ routed: true })),
  routeShow: vi.fn(async () => ({ routed: true })),
}))

import {
  routeMovie,
  routeShow,
} from '@services/watchlist-workflow/routing/content-router.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'

const USER_ID = 7

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
    vi.clearAllMocks()
    exclusionMap = new Map()

    const db = {
      getUser: vi.fn(async () => ({
        id: USER_ID,
        name: 'Tester',
        can_sync: true,
      })),
      getPrimaryUser: vi.fn(async () => ({ id: 1 })),
      getExclusionMap: vi.fn(async () => exclusionMap),
    } as unknown as DatabaseService

    deps = {
      db,
      logger: createMockLogger(),
    } as unknown as ContentRoutingDeps
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
