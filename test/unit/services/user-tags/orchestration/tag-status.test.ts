import type { ArrSource, ArrType } from '@services/user-tags/types.js'
import {
  TagStatusUnavailableError,
  UserTagsExistError,
} from '@services/user-tags/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeAdapter,
  createFakeSource,
  createUserTagDeps,
} from '../../../../mocks/user-tag-deps.js'

vi.mock('@services/user-tags/arr-adapter.js', () => ({
  getArrSource: vi.fn(),
}))

import { getArrSource } from '@services/user-tags/arr-adapter.js'
import {
  assertPrefixChangeAllowed,
  getTagStatus,
} from '@services/user-tags/orchestration/tag-status.js'

function useSources(sources: Partial<Record<ArrType, ArrSource>>) {
  vi.mocked(getArrSource).mockImplementation(
    (type) => sources[type] ?? createFakeSource(type, []),
  )
}

describe('getTagStatus', () => {
  beforeEach(() => {
    vi.mocked(getArrSource).mockReset()
  })

  it('counts user tags and distinct tagged items per instance', async () => {
    useSources({
      sonarr: createFakeSource('sonarr', [
        createFakeAdapter({
          getTagDetails: vi.fn(async () => [
            { id: 1, label: 'pulsarr-user-alice', itemIds: [1, 2] },
            { id: 2, label: 'pulsarr-user-bob', itemIds: [2, 3] },
            { id: 3, label: 'unrelated', itemIds: [4] },
          ]),
        }),
      ]),
      radarr: createFakeSource('radarr', [
        createFakeAdapter({ type: 'radarr', instanceId: 5, name: 'Movies' }),
      ]),
    })

    const status = await getTagStatus(createUserTagDeps())

    expect(status).toEqual({
      tagsExist: true,
      instances: [
        {
          type: 'sonarr',
          instanceId: 1,
          name: 'Main',
          enabled: true,
          reachable: true,
          tagCount: 2,
          taggedItemCount: 3,
        },
        {
          type: 'radarr',
          instanceId: 5,
          name: 'Movies',
          enabled: true,
          reachable: true,
          tagCount: 0,
          taggedItemCount: 0,
        },
      ],
    })
  })

  it('still reports instances of a type whose tagging is off', async () => {
    const radarr = createFakeSource('radarr', [
      createFakeAdapter({
        type: 'radarr',
        getTagDetails: vi.fn(async () => [
          { id: 1, label: 'pulsarr-user-alice', itemIds: [1] },
        ]),
      }),
    ])
    useSources({ radarr })

    const status = await getTagStatus(
      createUserTagDeps({ config: { tagUsersInRadarr: false } }),
    )

    expect(status.tagsExist).toBe(true)
    expect(status.instances).toEqual([
      expect.objectContaining({ type: 'radarr', enabled: false, tagCount: 1 }),
    ])
  })

  it('reports a failing instance as unreachable with zero counts', async () => {
    useSources({
      sonarr: createFakeSource('sonarr', [
        createFakeAdapter({
          getTagDetails: vi.fn(async () => {
            throw new Error('timeout')
          }),
        }),
      ]),
    })

    const status = await getTagStatus(createUserTagDeps())

    expect(status.tagsExist).toBe(false)
    expect(status.instances[0]).toMatchObject({
      reachable: false,
      tagCount: 0,
      taggedItemCount: 0,
    })
  })
})

describe('assertPrefixChangeAllowed', () => {
  it('throws while user tags exist and passes once they are gone', async () => {
    const getTagDetails = vi.fn(async () => [
      { id: 1, label: 'pulsarr-user-alice', itemIds: [1] },
    ])
    useSources({
      sonarr: createFakeSource('sonarr', [
        createFakeAdapter({ getTagDetails }),
      ]),
    })

    await expect(
      assertPrefixChangeAllowed({ tagPrefix: 'other' }, createUserTagDeps()),
    ).rejects.toBeInstanceOf(UserTagsExistError)
    await expect(
      assertPrefixChangeAllowed(
        { tagNamingSource: 'alias' },
        createUserTagDeps(),
      ),
    ).rejects.toBeInstanceOf(UserTagsExistError)

    getTagDetails.mockResolvedValue([])
    await expect(
      assertPrefixChangeAllowed({ tagPrefix: 'other' }, createUserTagDeps()),
    ).resolves.toBeUndefined()
  })

  it('fails closed when an instance cannot be read', async () => {
    useSources({
      sonarr: createFakeSource('sonarr', [
        createFakeAdapter({
          name: 'Main',
          getTagDetails: vi.fn(async () => {
            throw new Error('timeout')
          }),
        }),
      ]),
    })

    await expect(
      assertPrefixChangeAllowed({ tagPrefix: 'other' }, createUserTagDeps()),
    ).rejects.toBeInstanceOf(TagStatusUnavailableError)
  })

  it('blocks a change while tags remain on a type whose tagging is off', async () => {
    useSources({
      radarr: createFakeSource('radarr', [
        createFakeAdapter({
          type: 'radarr',
          getTagDetails: vi.fn(async () => [
            { id: 1, label: 'pulsarr-user-alice', itemIds: [] },
          ]),
        }),
      ]),
    })

    await expect(
      assertPrefixChangeAllowed(
        { tagPrefix: 'other' },
        createUserTagDeps({ config: { tagUsersInRadarr: false } }),
      ),
    ).rejects.toBeInstanceOf(UserTagsExistError)
  })

  it('does not read tag status when neither value changes', async () => {
    const getTagDetails = vi.fn(async () => [
      { id: 1, label: 'pulsarr-user-alice', itemIds: [1] },
    ])
    useSources({
      sonarr: createFakeSource('sonarr', [
        createFakeAdapter({ getTagDetails }),
      ]),
    })

    await expect(
      assertPrefixChangeAllowed(
        { tagPrefix: 'pulsarr-user', tagNamingSource: 'username' },
        createUserTagDeps(),
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertPrefixChangeAllowed({}, createUserTagDeps()),
    ).resolves.toBeUndefined()
    expect(getTagDetails).not.toHaveBeenCalled()
  })
})
