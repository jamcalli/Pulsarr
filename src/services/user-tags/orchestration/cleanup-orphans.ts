import { getAdapters } from '../arr-adapter.js'
import {
  getTagSettings,
  getUserTagLabel,
  groupTagsByItem,
  isAppUserTag,
} from '../tag-operations/tag-predicate.js'
import {
  ARR_META,
  type ArrType,
  type OrphanedTagCleanupResults,
  type TagCleanupResults,
  type UserTagDeps,
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
  const { displayName } = ARR_META[type]
  const { tagPrefix } = getTagSettings(deps.config)
  const { adapters, instanceCount } = await getAdapters(
    type,
    deps,
    'skipping orphaned tag cleanup',
  )
  const results = emptyResults(instanceCount)

  for (const adapter of adapters) {
    try {
      const orphanedTags = (await adapter.getTagDetails()).filter(
        (tag) =>
          isAppUserTag(tag.label, tagPrefix) &&
          !validUserTagLabels.has(tag.label.toLowerCase()),
      )

      if (orphanedTags.length === 0) {
        deps.logger.debug(
          `No orphaned user tags found in ${displayName} instance ${adapter.name}`,
        )
        continue
      }

      deps.logger.debug(
        {
          instance: adapter.name,
          instanceId: adapter.instanceId,
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
            `Error removing orphaned tags in ${displayName} instance ${adapter.name}:`,
          )
          results.failed += updates.length
        }
      }

      deps.logger.debug(
        {
          instance: adapter.name,
          instanceId: adapter.instanceId,
          cleanedItems: updates.length,
        },
        `Completed orphaned tag cleanup for ${displayName}`,
      )
    } catch (instanceError) {
      deps.logger.error(
        { error: instanceError },
        `Error processing ${displayName} instance ${adapter.name} for orphaned tag cleanup:`,
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
