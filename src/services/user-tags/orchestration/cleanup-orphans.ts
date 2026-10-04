import { getArrSource } from '../arr-adapter.js'
import { groupTagsByItem } from '../tag-operations/tag-grouping.js'
import {
  getTagSettings,
  getUserTagLabel,
  isAppUserTag,
} from '../tag-operations/tag-predicate.js'
import type {
  ArrType,
  OrphanedTagCleanupResults,
  TagCleanupResults,
  UserTagDeps,
} from '../types.js'
import { ensureMigrationComplete } from './migration-gate.js'

const emptyResults = (instances = 0): TagCleanupResults => ({
  removed: 0,
  skipped: 0,
  failed: 0,
  instances,
})

interface CleanupTypeParams {
  type: ArrType
  validUserTagLabels: Set<string>
}

async function cleanupOrphanedTagsForType(
  params: CleanupTypeParams,
  deps: UserTagDeps,
): Promise<TagCleanupResults> {
  const { type, validUserTagLabels } = params
  const source = getArrSource(type, deps)
  const { displayName } = source
  const { tagPrefix } = getTagSettings(deps.config)
  const instances = await source.getInstances()
  const results = emptyResults(instances.length)

  for (const instance of instances) {
    try {
      const adapter = source.getAdapter(instance)
      if (!adapter) {
        deps.logger.warn(
          `${displayName} service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
        )
        continue
      }

      const orphanedTags = (await adapter.getTagDetails()).filter(
        (tag) =>
          isAppUserTag(tag.label, tagPrefix) &&
          !validUserTagLabels.has(tag.label.toLowerCase()),
      )

      if (orphanedTags.length === 0) {
        deps.logger.debug(
          `No orphaned user tags found in ${displayName} instance ${instance.name}`,
        )
        continue
      }

      deps.logger.debug(
        {
          instance: instance.name,
          instanceId: instance.id,
          orphanedTags: orphanedTags.length,
        },
        'Found orphaned user tags',
      )

      const updates = groupTagsByItem(orphanedTags)
      if (updates.length > 0) {
        try {
          await adapter.bulkUpdateTags(updates, 'remove')
          results.removed += updates.length
        } catch (error) {
          deps.logger.error(
            { error },
            `Error removing orphaned tags in ${displayName} instance ${instance.name}:`,
          )
          results.failed += updates.length
        }
      }

      deps.logger.debug(
        {
          instance: instance.name,
          instanceId: instance.id,
          cleanedItems: updates.length,
        },
        `Completed orphaned tag cleanup for ${displayName}`,
      )
    } catch (instanceError) {
      deps.logger.error(
        { error: instanceError },
        `Error processing ${displayName} instance ${instance.name} for orphaned tag cleanup:`,
      )
    }
  }

  return results
}

export async function cleanupOrphanedUserTags(
  deps: UserTagDeps,
): Promise<OrphanedTagCleanupResults> {
  if (!deps.config.cleanupOrphanedTags) {
    deps.logger.info('Orphaned tag cleanup is disabled by configuration')
    return { radarr: emptyResults(), sonarr: emptyResults() }
  }

  try {
    await ensureMigrationComplete('radarr', deps)
    await ensureMigrationComplete('sonarr', deps)

    const { tagPrefix, tagNamingSource } = getTagSettings(deps.config)
    const users = (await deps.db.getAllUsers()).filter((user) => user.can_sync)
    const validUserTagLabels = new Set(
      users.map((user) =>
        getUserTagLabel(user, tagPrefix, tagNamingSource).toLowerCase(),
      ),
    )

    const [radarr, sonarr] = await Promise.all([
      cleanupOrphanedTagsForType({ type: 'radarr', validUserTagLabels }, deps),
      cleanupOrphanedTagsForType({ type: 'sonarr', validUserTagLabels }, deps),
    ])

    return { radarr, sonarr }
  } catch (error) {
    deps.logger.error({ error }, 'Error cleaning up orphaned user tags:')
    throw error
  }
}
