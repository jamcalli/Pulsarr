import { getAdapters } from '../arr-adapter.js'
import {
  getTagSettings,
  groupTagsByItem,
  isOwnedTag,
} from '../tag-operations/tag-predicate.js'
import {
  ARR_META,
  type ArrType,
  type RemoveResults,
  type UserTagDeps,
} from '../types.js'
import { ensureMigrationComplete } from './migration-gate.js'
import { withProgress } from './progress.js'

const emptyResults = (): RemoveResults => ({
  itemsProcessed: 0,
  itemsUpdated: 0,
  tagsRemoved: 0,
  tagsDeleted: 0,
  failed: 0,
  instances: 0,
})

export interface RemoveUserTagsParams {
  type: ArrType
  deleteTagDefinitions: boolean
}

export async function removeUserTags(
  params: RemoveUserTagsParams,
  deps: UserTagDeps,
): Promise<RemoveResults> {
  const { type, deleteTagDefinitions } = params
  const { displayName, itemNoun } = ARR_META[type]
  const results = emptyResults()

  // Removal runs even when tagging is off, since leftover tags block prefix changes.
  await ensureMigrationComplete(type, deps)

  const settings = getTagSettings(deps.config)

  return withProgress(
    {
      type: `${type}-tag-removal`,
      start: `Starting ${displayName} user tag removal...`,
      complete: (removed) =>
        `Completed ${displayName} tag removal: updated ${removed.itemsUpdated} ${itemNoun}, removed ${removed.tagsRemoved} tags, deleted ${removed.tagsDeleted} tag definitions`,
      failure: `Error removing ${displayName} user tags`,
      deps,
    },
    async (phase) => {
      const { adapters, instanceCount } = await getAdapters(type, deps)
      results.instances = instanceCount

      const updatesByInstance = (
        await Promise.all(
          adapters.map(async (adapter) => {
            try {
              const userTags = (await adapter.getTagDetails()).filter((tag) =>
                isOwnedTag(tag.label, settings),
              )
              return userTags.length > 0
                ? [{ adapter, userTags, updates: groupTagsByItem(userTags) }]
                : []
            } catch (error) {
              deps.logger.error(
                { error },
                `Error collecting data from instance ${adapter.name}:`,
              )
              return []
            }
          }),
        )
      ).flat()
      const totalItems = updatesByInstance.reduce(
        (sum, entry) => sum + entry.updates.length,
        0,
      )
      let processedItems = 0

      for (const { adapter, userTags, updates } of updatesByInstance) {
        results.itemsProcessed += updates.length
        deps.logger.debug(
          {
            instance: adapter.name,
            instanceId: adapter.instanceId,
            taggedItems: updates.length,
          },
          `Processing ${itemNoun} for tag removal`,
        )

        let bulkSucceeded = true
        try {
          if (updates.length > 0) {
            await adapter.bulkUpdateTags(updates, 'remove')
            results.tagsRemoved += updates.reduce(
              (sum, update) => sum + update.tagIds.length,
              0,
            )
            results.itemsUpdated += updates.length
          }
        } catch (instanceError) {
          bulkSucceeded = false
          deps.logger.error(
            { error: instanceError },
            `Error processing instance ${adapter.name}:`,
          )
          results.failed += updates.length
        }

        processedItems += updates.length
        if (totalItems > 0) {
          phase(
            `processing-${itemNoun}`,
            5 + Math.floor((processedItems / totalItems) * 85),
            `Processed ${updates.length} ${itemNoun} in ${adapter.name} (${processedItems}/${totalItems} total)`,
          )
        }

        // Deleting a tag definition leaves dangling ids on items that still carry it.
        if (deleteTagDefinitions && bulkSucceeded) {
          phase(
            'deleting-tags',
            90,
            `Deleting ${userTags.length} tag definitions from ${displayName} instance ${adapter.name}`,
          )

          for (const tag of userTags) {
            try {
              await adapter.deleteTag(tag.id)
              results.tagsDeleted++
            } catch (error) {
              deps.logger.error(
                { error },
                `Error deleting tag ID ${tag.id} from ${displayName}:`,
              )
            }
          }
        }
      }

      return results
    },
  )
}

export async function removeAllUserTags(
  deleteTagDefinitions: boolean,
  deps: UserTagDeps,
): Promise<Record<ArrType, RemoveResults>> {
  deps.logger.info(
    `Starting complete user tag removal in parallel (deleteDefinitions=${deleteTagDefinitions})`,
  )

  try {
    const [sonarr, radarr] = await Promise.all([
      removeUserTags({ type: 'sonarr', deleteTagDefinitions }, deps),
      removeUserTags({ type: 'radarr', deleteTagDefinitions }, deps),
    ])

    deps.logger.info(
      {
        itemsUpdated: sonarr.itemsUpdated + radarr.itemsUpdated,
        tagsRemoved: sonarr.tagsRemoved + radarr.tagsRemoved,
        tagsDeleted: sonarr.tagsDeleted + radarr.tagsDeleted,
        sonarr,
        radarr,
      },
      'User tag removal summary',
    )

    return { sonarr, radarr }
  } catch (error) {
    deps.logger.error({ error }, 'Error in complete tag removal:')
    throw error
  }
}
