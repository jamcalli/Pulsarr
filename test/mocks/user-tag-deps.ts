import type {
  ArrAdapter,
  ArrSource,
  ArrType,
  UserTagDeps,
} from '@services/user-tags/types.js'
import { vi } from 'vitest'
import { createMockLogger } from './logger.js'

type ShallowPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export function createUserTagDeps(
  overrides: ShallowPartial<Omit<UserTagDeps, 'logger'>> = {},
): UserTagDeps {
  const { config, fastify, migration, ...rest } = overrides

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
    fastify: {
      progress: {
        hasActiveConnections: vi.fn(() => false),
        emit: vi.fn(),
      },
      ...fastify,
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
    getAllItems: vi.fn(async () => []),
    extractItemId: vi.fn((guids: string[]) => {
      const arrGuid = guids.find((guid) => /^(sonarr|radarr):\d+$/.test(guid))
      return arrGuid ? Number(arrGuid.split(':')[1]) : 0
    }),
    usersWithItems: vi.fn(async () => []),
    ...overrides,
  }
}

export function createFakeSource(
  type: ArrType,
  adapters: Array<ArrAdapter | undefined>,
  overrides: Partial<ArrSource> = {},
): ArrSource {
  const instances = adapters.map((adapter, index) => ({
    id: adapter?.instanceId ?? 100 + index,
    name: adapter?.name ?? `missing-${index}`,
  }))
  return {
    type,
    displayName: type === 'sonarr' ? 'Sonarr' : 'Radarr',
    itemNoun: type === 'sonarr' ? 'series' : 'movies',
    getInstances: vi.fn(async () => instances),
    getAdapter: vi.fn((instance) =>
      adapters.find((adapter) => adapter?.instanceId === instance.id),
    ),
    fetchLibrary: vi.fn(async () => []),
    watchlistItemsForType: vi.fn(async () => []),
    ...overrides,
  }
}
