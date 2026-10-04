import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeAdapter,
  createUserTagDeps,
  useAdapters,
} from '../../../../mocks/user-tag-deps.js'

vi.mock('@services/user-tags/arr-adapter.js', () => ({
  getAdapters: vi.fn(),
  listInstances: vi.fn(),
}))

import { getAdapters, listInstances } from '@services/user-tags/arr-adapter.js'
import {
  removeAllUserTags,
  removeUserTags,
} from '@services/user-tags/orchestration/remove-tags.js'

const USER_TAGS = [
  { id: 1, label: 'pulsarr-user-alice', itemIds: [10, 11] },
  { id: 2, label: 'pulsarr-user-bob', itemIds: [11] },
  { id: 3, label: 'unrelated', itemIds: [10, 12] },
]

describe('removeUserTags', () => {
  beforeEach(() => {
    vi.mocked(getAdapters).mockReset()
    vi.mocked(listInstances).mockReset()
  })

  it('builds bulk removes from tag details without reading the library', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => USER_TAGS),
    })
    useAdapters({ sonarr: [adapter] })

    const results = await removeUserTags(
      { type: 'sonarr', deleteTagDefinitions: false },
      createUserTagDeps(),
    )

    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [
        { itemId: 10, tagIds: [1] },
        { itemId: 11, tagIds: [1, 2] },
      ],
      'remove',
    )
    expect(adapter.deleteTag).not.toHaveBeenCalled()
    expect(results).toEqual({
      itemsProcessed: 2,
      itemsUpdated: 2,
      tagsRemoved: 3,
      tagsDeleted: 0,
      failed: 0,
      instances: 1,
    })
  })

  it('deletes user tag definitions after the bulk update when asked', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => USER_TAGS),
    })
    useAdapters({ sonarr: [adapter] })

    const results = await removeUserTags(
      { type: 'sonarr', deleteTagDefinitions: true },
      createUserTagDeps(),
    )

    expect(vi.mocked(adapter.deleteTag).mock.calls).toEqual([[1], [2]])
    const bulkOrder = vi.mocked(adapter.bulkUpdateTags).mock
      .invocationCallOrder[0]
    const deleteOrder = vi.mocked(adapter.deleteTag).mock.invocationCallOrder[0]
    expect(bulkOrder).toBeLessThan(deleteOrder)
    expect(results.tagsDeleted).toBe(2)
  })

  it('keeps definitions when the bulk update failed', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => USER_TAGS),
      bulkUpdateTags: vi.fn(async () => {
        throw new Error('arr down')
      }),
    })
    useAdapters({ sonarr: [adapter] })

    const results = await removeUserTags(
      { type: 'sonarr', deleteTagDefinitions: true },
      createUserTagDeps(),
    )

    expect(adapter.deleteTag).not.toHaveBeenCalled()
    expect(results.failed).toBe(2)
    expect(results.itemsUpdated).toBe(0)
  })

  it('keeps going when one instance fails', async () => {
    const broken = createFakeAdapter({
      instanceId: 1,
      name: 'Broken',
      getTagDetails: vi.fn(async () => {
        throw new Error('unreachable')
      }),
    })
    const healthy = createFakeAdapter({
      instanceId: 2,
      name: 'Healthy',
      getTagDetails: vi.fn(async () => USER_TAGS),
    })
    useAdapters({ radarr: [broken, healthy] })

    const results = await removeUserTags(
      { type: 'radarr', deleteTagDefinitions: false },
      createUserTagDeps(),
    )

    expect(healthy.bulkUpdateTags).toHaveBeenCalledTimes(1)
    expect(results.instances).toBe(2)
    expect(results.itemsUpdated).toBe(2)
  })

  it('does nothing when tagging is disabled for the type', async () => {
    const adapter = createFakeAdapter()
    useAdapters({ sonarr: [adapter] })

    const results = await removeUserTags(
      { type: 'sonarr', deleteTagDefinitions: true },
      createUserTagDeps({ config: { tagUsersInSonarr: false } }),
    )

    expect(adapter.getTagDetails).not.toHaveBeenCalled()
    expect(results.instances).toBe(0)
  })
})

describe('removeAllUserTags', () => {
  it('returns results per type', async () => {
    const sonarr = createFakeAdapter({
      getTagDetails: vi.fn(async () => USER_TAGS),
    })
    const radarr = createFakeAdapter({ type: 'radarr' })
    useAdapters({
      sonarr: [sonarr],
      radarr: [radarr],
    })

    const results = await removeAllUserTags(false, createUserTagDeps())

    expect(results.sonarr.itemsUpdated).toBe(2)
    expect(results.radarr.itemsUpdated).toBe(0)
    expect(radarr.bulkUpdateTags).not.toHaveBeenCalled()
  })
})
