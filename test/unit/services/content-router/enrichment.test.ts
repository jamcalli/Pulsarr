import type { Config } from '@root/types/config.types.js'
import type {
  ContentItem,
  RouterRule,
  RoutingContext,
} from '@root/types/router.types.js'
import { enrichItemMetadata } from '@services/content-router/enrichment.js'
import { describe, expect, it, vi } from 'vitest'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const item: ContentItem = {
  title: 'Test Movie',
  type: 'movie',
  guids: ['tmdb:1'],
}

const context: RoutingContext = {
  userId: 1,
  contentType: 'movie',
  itemKey: 'key',
}

const rule = (field: string, value: string): RouterRule => ({
  id: 1,
  name: 'Rule',
  type: 'conditional',
  criteria: { condition: { field, operator: 'equals', value } },
  target_type: 'radarr',
  target_instance_id: 1,
  order: 50,
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

describe('enrichItemMetadata', () => {
  it('returns the item unchanged when the metadata lookup throws', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi.fn().mockRejectedValue(new Error('db')),
      },
    })

    await expect(
      enrichItemMetadata([rule('year', '2020')], item, context, deps),
    ).resolves.toEqual(item)
  })

  it('reads the Plex token from config on every call', async () => {
    const getUser = vi.fn().mockResolvedValue(null)
    const noTokens: string[] = []
    const fastify = { config: { plexTokens: noTokens } as Config }
    const deps = createContentRouterDeps({ db: { getUser }, fastify })
    const rules = [rule('plexList', 'Favorites')]

    await enrichItemMetadata(rules, item, context, deps)
    expect(getUser).not.toHaveBeenCalled()

    fastify.config = { plexTokens: ['token'] } as Config
    await enrichItemMetadata(rules, item, context, deps)
    expect(getUser).toHaveBeenCalledWith(1)
  })
})
