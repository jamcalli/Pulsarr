import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
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
import { cleanupOrphanedUserTags } from '@services/user-tags/orchestration/cleanup-orphans.js'

const TAG_DETAILS = [
  { id: 1, label: 'pulsarr-user-alice', itemIds: [10] },
  { id: 2, label: 'pulsarr-user-gone', itemIds: [10, 11] },
  { id: 3, label: 'pulsarr-user-nosync', itemIds: [12] },
  { id: 4, label: 'unrelated', itemIds: [13] },
]

function depsWithUsers() {
  return createUserTagDeps({
    db: {
      getAllUsers: vi.fn(async () => [
        createMockUser(1, 'alice'),
        createMockUser(2, 'nosync', { can_sync: false }),
      ]),
    },
  })
}

describe('cleanupOrphanedUserTags', () => {
  beforeEach(() => {
    vi.mocked(getAdapters).mockReset()
    vi.mocked(listInstances).mockReset()
  })

  it('removes user tags that no sync-enabled user owns, using tag details', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => TAG_DETAILS),
    })
    useAdapters({ sonarr: [adapter] })

    const results = await cleanupOrphanedUserTags(depsWithUsers())

    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [
        { itemId: 10, tagIds: [2] },
        { itemId: 11, tagIds: [2] },
        { itemId: 12, tagIds: [3] },
      ],
      'remove',
    )
    expect(results.sonarr).toEqual({
      removed: 3,
      skipped: 0,
      failed: 0,
      instances: 1,
    })
    expect(results.radarr.instances).toBe(0)
  })

  it('makes no update when every user tag has an owner', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => [TAG_DETAILS[0], TAG_DETAILS[3]]),
    })
    useAdapters({ radarr: [adapter] })

    const results = await cleanupOrphanedUserTags(depsWithUsers())

    expect(adapter.bulkUpdateTags).not.toHaveBeenCalled()
    expect(results.radarr.removed).toBe(0)
  })

  it('does nothing when orphan cleanup is disabled', async () => {
    const adapter = createFakeAdapter({
      getTagDetails: vi.fn(async () => TAG_DETAILS),
    })
    useAdapters({ sonarr: [adapter] })
    const deps = createUserTagDeps({ config: { cleanupOrphanedTags: false } })

    const results = await cleanupOrphanedUserTags(deps)

    expect(adapter.getTagDetails).not.toHaveBeenCalled()
    expect(deps.migration.checkAllInstancesMigrated).not.toHaveBeenCalled()
    expect(results.sonarr.instances).toBe(0)
  })
})
