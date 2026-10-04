import {
  type ArrInstance,
  getAdapters,
  listInstances,
} from '@services/user-tags/arr-adapter.js'
import type {
  ArrAdapter,
  ArrType,
  UserTagDeps,
} from '@services/user-tags/types.js'
import { vi } from 'vitest'
import { createMockLogger } from './logger.js'

type ShallowPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export function createUserTagDeps(
  overrides: ShallowPartial<Omit<UserTagDeps, 'logger'>> = {},
): UserTagDeps {
  const { config, progress, migration, ...rest } = overrides

  // the only place tests widen partial fakes into the real dependency types
  return {
    logger: createMockLogger(),
    config: {
      tagUsersInSonarr: true,
      tagUsersInRadarr: true,
      cleanupOrphanedTags: true,
      tagPrefix: 'pulsarr-user',
      tagNamingSource: 'username',
      removedTagMode: 'remove',
      removedTagPrefix: 'pulsarr-removed',
      ...config,
    },
    db: {},
    progress: {
      hasActiveConnections: vi.fn(() => false),
      emit: vi.fn(),
      ...progress,
    },
    sonarrManager: {},
    radarrManager: {},
    migration: {
      checkAllInstancesMigrated: vi.fn(async () => true),
      migrateInstanceTags: vi.fn(async () => undefined),
      cleanupMigrationFileIfComplete: vi.fn(async () => undefined),
      ...migration,
    },
    ...rest,
  } as unknown as UserTagDeps
}

export function createFakeAdapter(
  overrides: Partial<ArrAdapter> = {},
): ArrAdapter {
  return {
    type: 'sonarr',
    instanceId: 1,
    name: 'Main',
    getTags: vi.fn(async () => []),
    getTagDetails: vi.fn(async () => []),
    createTag: vi.fn(async (label: string) => ({ id: 999, label })),
    deleteTag: vi.fn(async () => undefined),
    bulkUpdateTags: vi.fn(async () => undefined),
    extractItemId: vi.fn((guids: string[]) => {
      const arrGuid = guids.find((guid) => /^(sonarr|radarr):\d+$/.test(guid))
      return arrGuid ? Number(arrGuid.split(':')[1]) : 0
    }),
    usersWithItems: vi.fn(async () => []),
    ...overrides,
  }
}

/** Requires the calling test file to `vi.mock('@services/user-tags/arr-adapter.js')`; undefined entries stand for instances without a live service. */
export function useAdapters(
  adapters: Partial<Record<ArrType, Array<ArrAdapter | undefined>>>,
): void {
  const instancesFor = (type: ArrType): ArrInstance[] =>
    (adapters[type] ?? []).map((adapter, index) => ({
      instance: {
        id: adapter?.instanceId ?? 100 + index,
        name: adapter?.name ?? `missing-${index}`,
      },
      adapter,
    }))
  vi.mocked(listInstances).mockImplementation(async (type) =>
    instancesFor(type),
  )
  vi.mocked(getAdapters).mockImplementation(async (type) => {
    const instances = instancesFor(type)
    return {
      adapters: instances.flatMap(({ adapter }) => (adapter ? [adapter] : [])),
      instanceCount: instances.length,
    }
  })
}
