import { getArrSource } from '../arr-adapter.js'
import { groupTagsByItem } from '../tag-operations/tag-grouping.js'
import {
  getTagSettings,
  isAppUserTag,
  isTaggingEnabled,
} from '../tag-operations/tag-predicate.js'
import type {
  ArrAdapter,
  ArrType,
  RemoveResults,
  TagDetail,
  UserTagDeps,
} from '../types.js'
import { ensureMigrationComplete } from './migration-gate.js'

const emptyResults = (): RemoveResults => ({
  itemsProcessed: 0,
  itemsUpdated: 0,
  tagsRemoved: 0,
  tagsDeleted: 0,
  failed: 0,
  instances: 0,
})

interface InstanceUserTags {
  adapter: ArrAdapter
  userTags: TagDetail[]
}

export interface RemoveUserTagsParams {
  type: ArrType
  deleteTagDefinitions: boolean
}

export async function removeUserTags(
  params: RemoveUserTagsParams,
  deps: UserTagDeps,
): Promise<RemoveResults> {
  const { type, deleteTagDefinitions } = params
  const source = getArrSource(type, deps)
  const { displayName, itemNoun } = source
  const results = emptyResults()

  if (!isTaggingEnabled(deps.config, type)) {
    deps.logger.debug(
      `${displayName} user tagging disabled, skipping tag removal`,
    )
    return results
  }

  await ensureMigrationComplete(type, deps)

  const { tagPrefix } = getTagSettings(deps.config)
  const progressType = `${type}-tag-removal` as const
  const operationId = `${progressType}-${Date.now()}`
  const { progress } = deps.fastify
  const emitProgress = progress.hasActiveConnections()

  try {
    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'start',
        progress: 5,
        message: `Starting ${displayName} user tag removal...`,
      })
    }

    const instances = await source.getInstances()
    results.instances = instances.length

    const collected = await Promise.all(
      instances.map(async (instance): Promise<InstanceUserTags | null> => {
        try {
          const adapter = source.getAdapter(instance)
          if (!adapter) return null
          const userTags = (await adapter.getTagDetails()).filter((tag) =>
            isAppUserTag(tag.label, tagPrefix),
          )
          return userTags.length > 0 ? { adapter, userTags } : null
        } catch (error) {
          deps.logger.error(
            { error },
            `Error collecting data from instance ${instance.name}:`,
          )
          return null
        }
      }),
    )
    const withUserTags = collected.filter(
      (entry): entry is InstanceUserTags => entry !== null,
    )

    const updatesByInstance = withUserTags.map(({ adapter, userTags }) => ({
      adapter,
      userTags,
      updates: groupTagsByItem(userTags),
    }))
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
      if (emitProgress && totalItems > 0) {
        progress.emit({
          operationId,
          type: progressType,
          phase: `processing-${itemNoun}`,
          progress: 5 + Math.floor((processedItems / totalItems) * 85),
          message: `Processed ${updates.length} ${itemNoun} in ${adapter.name} (${processedItems}/${totalItems} total)`,
        })
      }

      // Deleting a tag definition leaves dangling ids on items that still carry it.
      if (deleteTagDefinitions && bulkSucceeded) {
        if (emitProgress) {
          progress.emit({
            operationId,
            type: progressType,
            phase: 'deleting-tags',
            progress: 90,
            message: `Deleting ${userTags.length} tag definitions from ${displayName} instance ${adapter.name}`,
          })
        }

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

    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'complete',
        progress: 100,
        message: `Completed ${displayName} tag removal: updated ${results.itemsUpdated} ${itemNoun}, removed ${results.tagsRemoved} tags, deleted ${results.tagsDeleted} tag definitions`,
      })
    }

    return results
  } catch (error) {
    deps.logger.error({ error }, `Error removing ${displayName} user tags:`)

    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'error',
        progress: 100,
        message: `Error removing ${displayName} user tags: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }

    throw error
  }
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
