import type {
  ContentItem,
  RouterRule,
  RoutingContext,
} from '@root/types/router.types.js'
import { getTargetInstances } from '@services/content-router/target-instances.js'
import { describe, expect, it, vi } from 'vitest'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const item: ContentItem = {
  title: 'Test Movie',
  type: 'movie',
  guids: ['tmdb:1'],
  genres: ['Drama'],
}

const context: RoutingContext = {
  userId: 1,
  contentType: 'movie',
  itemKey: 'key',
}

const rule = (overrides: Partial<RouterRule>): RouterRule => ({
  id: 1,
  name: 'Drama',
  type: 'conditional',
  criteria: {
    condition: { field: 'genres', operator: 'contains', value: 'Drama' },
  },
  target_type: 'radarr',
  target_instance_id: 1,
  order: 50,
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const targetDeps = (rules: () => Promise<RouterRule[]>) =>
  createContentRouterDeps({
    rules: { get: vi.fn().mockImplementation(rules) },
    db: {
      getDefaultRadarrInstance: vi
        .fn()
        .mockResolvedValue({ id: 9, name: 'Default' }),
    },
  })

describe('getTargetInstances', () => {
  it('dedupes the instances matched rules target', async () => {
    const deps = targetDeps(() =>
      Promise.resolve([
        rule({ id: 1, target_instance_id: 2 }),
        rule({ id: 2, target_instance_id: 2 }),
        rule({ id: 3, target_instance_id: 3 }),
      ]),
    )

    expect(await getTargetInstances(item, context, deps)).toEqual({
      instanceIds: [2, 3],
    })
  })

  it('reports an exclude match', async () => {
    const deps = targetDeps(() =>
      Promise.resolve([rule({ exclude_from_routing: true })]),
    )

    expect(await getTargetInstances(item, context, deps)).toEqual({
      instanceIds: [],
      skipReason: 'excluded',
    })
  })

  it('falls back to the sync target when no rule matches', async () => {
    const deps = targetDeps(() => Promise.resolve([]))

    expect(
      await getTargetInstances(
        item,
        { ...context, syncing: true, syncTargetInstanceId: 4 },
        deps,
      ),
    ).toEqual({ instanceIds: [4] })
  })

  it('falls back to the default instances when no rule matches', async () => {
    const deps = targetDeps(() => Promise.resolve([]))

    expect(await getTargetInstances(item, context, deps)).toEqual({
      instanceIds: [9],
    })
  })

  it('fails closed when the rules cannot be read', async () => {
    const deps = targetDeps(() => Promise.reject(new Error('db')))

    await expect(getTargetInstances(item, context, deps)).rejects.toThrow('db')
    expect(deps.db.getDefaultRadarrInstance).not.toHaveBeenCalled()
  })

  it('fails closed when the default instance cannot be read', async () => {
    const deps = createContentRouterDeps({
      rules: { get: vi.fn().mockResolvedValue([]) },
      db: {
        getDefaultRadarrInstance: vi.fn().mockRejectedValue(new Error('db')),
      },
    })

    await expect(getTargetInstances(item, context, deps)).rejects.toThrow('db')
  })
})
