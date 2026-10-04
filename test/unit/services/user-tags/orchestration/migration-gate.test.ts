import {
  ensureMigrationComplete,
  TagMigrationFailedError,
} from '@services/user-tags/orchestration/migration-gate.js'
import { describe, expect, it, vi } from 'vitest'
import { createUserTagDeps } from '../../../../mocks/user-tag-deps.js'

const result = (instanceName: string, success: boolean) => ({
  instanceId: 1,
  instanceName,
  tagsMigrated: 0,
  contentUpdated: 0,
  success,
})

describe('ensureMigrationComplete', () => {
  it('does not migrate when every instance is already migrated', async () => {
    const deps = createUserTagDeps()

    await ensureMigrationComplete('sonarr', deps)

    expect(deps.migration.migrateInstanceTags).not.toHaveBeenCalled()
  })

  it('migrates and returns when every instance succeeds', async () => {
    const deps = createUserTagDeps({
      migration: {
        checkAllInstancesMigrated: vi.fn(async () => false),
        migrateInstanceTags: vi.fn(async () => [result('Main', true)]),
      },
    })

    await expect(
      ensureMigrationComplete('sonarr', deps),
    ).resolves.toBeUndefined()
    expect(deps.migration.migrateInstanceTags).toHaveBeenCalledWith('sonarr')
  })

  it('throws naming the instances whose migration failed', async () => {
    const deps = createUserTagDeps({
      migration: {
        checkAllInstancesMigrated: vi.fn(async () => false),
        migrateInstanceTags: vi.fn(async () => [
          result('Main', true),
          result('Anime', false),
        ]),
      },
    })

    const run = ensureMigrationComplete('sonarr', deps)
    await expect(run).rejects.toBeInstanceOf(TagMigrationFailedError)
    await expect(run).rejects.toThrow('Anime')
  })
})
