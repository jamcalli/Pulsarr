import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type InstanceSyncConfig,
  syncInstance,
} from '@services/watchlist-status/instance-sync/instance-syncer.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const SOURCE_ID = 1
const TARGET_ID = 2

function movie(title: string, guids: string[], instanceId: number): RadarrItem {
  return { title, type: 'movie', guids, radarr_instance_id: instanceId }
}

async function run(allContent: RadarrItem[]) {
  const routeContent = vi.fn<ContentRouterService['routeContent']>(
    async () => ({ routedInstances: [TARGET_ID], routingDetails: [] }),
  )
  const contentRouter: Partial<ContentRouterService> = { routeContent }
  const db: Partial<DatabaseService> = { getAllUsers: vi.fn(async () => []) }

  const config: InstanceSyncConfig<
    RadarrItem,
    { id: number; name: string; syncedInstances: number[] }
  > = {
    contentType: 'movie',
    contentLabel: 'Movie',
    contentLabelPlural: 'movies',
    getInstance: async (id) => ({ id, name: 'Target', syncedInstances: [] }),
    getDefaultInstance: async () => ({
      id: SOURCE_ID,
      name: 'Default',
      syncedInstances: [TARGET_ID],
    }),
    getWatchlistItems: async () => [
      {
        id: 10,
        user_id: 1,
        title: 'Watched Movie',
        key: 'movie-key',
        type: 'movie',
        guids: ['tmdb:100', 'imdb:tt100'],
        status: 'requested',
      },
    ],
    getAllContent: async () => allContent,
    getContentInstanceId: (content) => content.radarr_instance_id,
    getAllJunctions: async () => [{ watchlist_id: 10, instance_id: SOURCE_ID }],
    addToInstance: vi.fn(async () => {}),
  }

  const copied = await syncInstance(
    {
      db: db as DatabaseService,
      contentRouter: contentRouter as ContentRouterService,
      logger: createMockLogger(),
    },
    config,
    TARGET_ID,
  )
  return { copied, routeContent }
}

describe('syncInstance', () => {
  it('copies the first arr item in library order that shares a guid, not the closest match', async () => {
    const first = movie('First', ['tmdb:100'], SOURCE_ID)
    const second = movie('Second', ['tmdb:100', 'imdb:tt100'], 3)

    const { copied, routeContent } = await run([
      movie('Unrelated', ['tmdb:999'], SOURCE_ID),
      first,
      second,
    ])

    expect(copied).toBe(1)
    expect(routeContent).toHaveBeenCalledTimes(1)
    expect(routeContent.mock.calls[0][0]).toBe(first)
  })

  it('copies nothing when no arr item shares a guid', async () => {
    const { copied, routeContent } = await run([
      movie('Unrelated', ['tmdb:999'], SOURCE_ID),
    ])

    expect(copied).toBe(0)
    expect(routeContent).not.toHaveBeenCalled()
  })
})
