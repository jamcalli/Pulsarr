import type { RemovedTagMode } from '@root/types/config.types.js'
import type {
  ArrAdapter,
  ArrSource,
  ArrType,
  LibraryItem,
} from '@services/user-tags/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import {
  createFakeAdapter,
  createFakeSource,
  createUserTagDeps,
} from '../../../../mocks/user-tag-deps.js'

vi.mock('@services/user-tags/arr-adapter.js', () => ({
  getArrSource: vi.fn(),
}))
vi.mock('@services/user-tags/orchestration/migration-gate.js', () => ({
  ensureMigrationComplete: vi.fn(async () => undefined),
}))

import { getArrSource } from '@services/user-tags/arr-adapter.js'
import { ensureMigrationComplete } from '@services/user-tags/orchestration/migration-gate.js'
import {
  syncTags,
  tagContentWithData,
} from '@services/user-tags/orchestration/sync-tags.js'

const ALICE = createMockUser(1, 'alice')
const BOB = createMockUser(2, 'bob')
const ALICE_TAG = 1
const BOB_TAG = 2
const REMOVED_TAG = 3

function libraryItem(arrId: number, tags: number[]): LibraryItem {
  return {
    instanceId: 1,
    title: `Item ${arrId}`,
    guids: [`tvdb:${arrId}00`, `sonarr:${arrId}`],
    tags,
    isExclusion: false,
  }
}

function useSources(sources: Partial<Record<ArrType, ArrSource>>) {
  vi.mocked(getArrSource).mockImplementation(
    (type) => sources[type] ?? createFakeSource(type, []),
  )
}

function adapterWithTags(): ArrAdapter {
  return createFakeAdapter({
    usersWithItems: vi.fn(async () => [ALICE, BOB]),
    getTags: vi.fn(async () => [
      { id: ALICE_TAG, label: 'pulsarr-user-alice' },
      { id: BOB_TAG, label: 'pulsarr-user-bob' },
      { id: REMOVED_TAG, label: 'pulsarr-removed' },
    ]),
  })
}

async function tag(
  adapter: ArrAdapter,
  items: LibraryItem[],
  removedTagMode: RemovedTagMode,
) {
  useSources({ sonarr: createFakeSource('sonarr', [adapter]) })
  return tagContentWithData(
    {
      type: 'sonarr',
      items,
      watchlistItems: [{ user_id: ALICE.id, guids: ['tvdb:100'] }],
    },
    createUserTagDeps({ config: { removedTagMode } }),
  )
}

describe('tagContentWithData', () => {
  beforeEach(() => {
    vi.mocked(getArrSource).mockReset()
  })

  it('adds missing user tags and removes stale ones in remove mode', async () => {
    const adapter = adapterWithTags()

    const results = await tag(
      adapter,
      [libraryItem(1, [BOB_TAG]), libraryItem(2, [ALICE_TAG, REMOVED_TAG])],
      'remove',
    )

    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 1, tagIds: [ALICE_TAG] }],
      'add',
    )
    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [
        { itemId: 1, tagIds: [BOB_TAG] },
        { itemId: 2, tagIds: [ALICE_TAG, REMOVED_TAG] },
      ],
      'remove',
    )
    expect(results).toEqual({ tagged: 2, skipped: 0, failed: 0 })
  })

  it('keeps instances apart: own items, own users, own tag ids', async () => {
    const main = createFakeAdapter({
      instanceId: 1,
      name: 'Main',
      usersWithItems: vi.fn(async () => [ALICE]),
      getTags: vi.fn(async () => [{ id: 11, label: 'pulsarr-user-alice' }]),
    })
    const anime = createFakeAdapter({
      instanceId: 2,
      name: 'Anime',
      usersWithItems: vi.fn(async () => [BOB]),
      getTags: vi.fn(async () => [{ id: 22, label: 'pulsarr-user-bob' }]),
    })
    useSources({ sonarr: createFakeSource('sonarr', [main, anime]) })

    const results = await tagContentWithData(
      {
        type: 'sonarr',
        items: [
          { ...libraryItem(1, []), instanceId: 1 },
          { ...libraryItem(2, []), instanceId: 2 },
        ],
        watchlistItems: [
          { user_id: ALICE.id, guids: ['tvdb:100'] },
          { user_id: BOB.id, guids: ['tvdb:100', 'tvdb:200'] },
        ],
      },
      createUserTagDeps(),
    )

    expect(main.bulkUpdateTags).toHaveBeenCalledTimes(1)
    expect(main.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 1, tagIds: [11] }],
      'add',
    )
    expect(anime.bulkUpdateTags).toHaveBeenCalledTimes(1)
    expect(anime.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 2, tagIds: [22] }],
      'add',
    )
    expect(results).toEqual({ tagged: 2, skipped: 0, failed: 0 })
  })

  it('leaves unwatched items alone in keep mode', async () => {
    const adapter = adapterWithTags()

    const results = await tag(
      adapter,
      [libraryItem(1, [REMOVED_TAG]), libraryItem(2, [BOB_TAG])],
      'keep',
    )

    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 1, tagIds: [ALICE_TAG] }],
      'add',
    )
    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 1, tagIds: [REMOVED_TAG] }],
      'remove',
    )
    expect(results).toEqual({ tagged: 1, skipped: 1, failed: 0 })
  })

  it('swaps stale user tags for the removed tag in special-tag mode', async () => {
    const adapter = adapterWithTags()

    await tag(adapter, [libraryItem(2, [BOB_TAG])], 'special-tag')

    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 2, tagIds: [REMOVED_TAG] }],
      'add',
    )
    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 2, tagIds: [BOB_TAG] }],
      'remove',
    )
  })

  it('creates the removed tag on demand in special-tag mode', async () => {
    const adapter = createFakeAdapter({
      usersWithItems: vi.fn(async () => [ALICE, BOB]),
      getTags: vi.fn(async () => [
        { id: ALICE_TAG, label: 'pulsarr-user-alice' },
        { id: BOB_TAG, label: 'pulsarr-user-bob' },
      ]),
      createTag: vi.fn(async (label: string) => ({ id: 50, label })),
    })

    await tag(adapter, [libraryItem(2, [BOB_TAG])], 'special-tag')

    expect(adapter.createTag).toHaveBeenCalledWith('pulsarr-removed')
    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 2, tagIds: [50] }],
      'add',
    )
  })

  it('ignores watchlist entries from users without sync on the instance', async () => {
    const adapter = createFakeAdapter({
      usersWithItems: vi.fn(async () => [BOB]),
      getTags: vi.fn(async () => [
        { id: ALICE_TAG, label: 'pulsarr-user-alice' },
        { id: BOB_TAG, label: 'pulsarr-user-bob' },
      ]),
    })

    const results = await tag(adapter, [libraryItem(1, [])], 'remove')

    expect(adapter.bulkUpdateTags).not.toHaveBeenCalled()
    expect(results).toEqual({ tagged: 0, skipped: 1, failed: 0 })
  })

  it('reads tags from the arr when the passed items carry none', async () => {
    const adapter = adapterWithTags()
    vi.mocked(adapter.getAllItems).mockResolvedValue([
      { id: 1, guids: [], tags: [BOB_TAG] },
    ])
    const item = { ...libraryItem(1, []), tags: undefined }

    await tag(adapter, [item], 'remove')

    expect(adapter.getAllItems).toHaveBeenCalledTimes(1)
    expect(adapter.bulkUpdateTags).toHaveBeenCalledWith(
      [{ itemId: 1, tagIds: [BOB_TAG] }],
      'remove',
    )
  })
})

describe('syncTags', () => {
  beforeEach(() => {
    vi.mocked(getArrSource).mockReset()
    vi.mocked(ensureMigrationComplete).mockClear()
  })

  it('runs the migration gate before touching any instance', async () => {
    const adapter = adapterWithTags()
    const source = createFakeSource('sonarr', [adapter])
    useSources({ sonarr: source })

    await syncTags('sonarr', createUserTagDeps())

    const gateOrder = vi.mocked(ensureMigrationComplete).mock
      .invocationCallOrder[0]
    const tagsOrder = vi.mocked(adapter.getTags).mock.invocationCallOrder[0]
    expect(gateOrder).toBeLessThan(tagsOrder)
  })

  it('skips everything when tagging is disabled for the type', async () => {
    const source = createFakeSource('radarr', [])
    useSources({ radarr: source })

    const results = await syncTags(
      'radarr',
      createUserTagDeps({ config: { tagUsersInRadarr: false } }),
    )

    expect(source.fetchLibrary).not.toHaveBeenCalled()
    expect(ensureMigrationComplete).not.toHaveBeenCalled()
    expect(results).toEqual({ tagged: 0, skipped: 0, failed: 0 })
  })
})
