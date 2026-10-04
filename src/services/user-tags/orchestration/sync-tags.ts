import { getArrSource } from '../arr-adapter.js'
import {
  buildGuidIndex,
  type GuidIndex,
  usersForGuids,
} from '../matching/guid-index.js'
import { computeTagDiffs } from '../tag-operations/tag-diff.js'
import {
  getTagSettings,
  getUserTagLabel,
  isTaggingEnabled,
} from '../tag-operations/tag-predicate.js'
import type {
  ArrAdapter,
  ArrType,
  ItemTagUpdate,
  LibraryItem,
  OrphanedTagCleanupResults,
  SyncAllResults,
  TaggingResults,
  TagSettings,
  UserTagDeps,
  WatchlistGuidItem,
} from '../types.js'
import { cleanupOrphanedUserTags } from './cleanup-orphans.js'
import { ensureUserTags } from './create-tags.js'
import { ensureMigrationComplete } from './migration-gate.js'

const emptyResults = (): TaggingResults => ({
  tagged: 0,
  skipped: 0,
  failed: 0,
})

async function ensureRemovedTag(
  adapter: ArrAdapter,
  removedLabel: string,
  tagLabelMap: Map<string, number>,
  tagIdMap: Map<number, string>,
  itemName: string,
  deps: Pick<UserTagDeps, 'logger'>,
): Promise<number> {
  const lowerLabel = removedLabel.toLowerCase()
  const existingId = tagLabelMap.get(lowerLabel)
  if (existingId) return existingId

  try {
    deps.logger.debug(`Creating removed tag "${removedLabel}" for ${itemName}`)
    const newTag = await adapter.createTag(removedLabel)
    tagLabelMap.set(lowerLabel, newTag.id)
    tagIdMap.set(newTag.id, lowerLabel)
    return newTag.id
  } catch (error) {
    deps.logger.error({ error }, `Error creating removed tag for ${itemName}:`)
    throw error
  }
}

interface TagInstanceParams {
  adapter: ArrAdapter
  items: LibraryItem[]
  guidIndex: GuidIndex
  settings: TagSettings
}

async function tagInstance(
  params: TagInstanceParams,
  deps: UserTagDeps,
): Promise<TaggingResults> {
  const { adapter, items, guidIndex, settings } = params
  const { logger } = deps
  const users = await adapter.usersWithItems()
  const { tagLabelMap, tagIdMap } = await ensureUserTags(adapter, users, deps)

  const userTagIdByUser = new Map<number, number>()
  for (const user of users) {
    const label = getUserTagLabel(
      user,
      settings.tagPrefix,
      settings.tagNamingSource,
    )
    const tagId = tagLabelMap.get(label.toLowerCase())
    if (tagId) userTagIdByUser.set(user.id, tagId)
  }

  const instanceItems = items.filter(
    (item) => item.instanceId === adapter.instanceId && !item.isExclusion,
  )
  const hasTagsInData =
    instanceItems.length > 0 && instanceItems[0].tags !== undefined

  const tagsByItemId = new Map<number, number[]>()
  if (hasTagsInData) {
    for (const item of instanceItems) {
      const itemId = adapter.extractItemId(item.guids)
      if (itemId > 0) tagsByItemId.set(itemId, item.tags ?? [])
    }
  } else {
    for (const item of await adapter.getAllItems()) {
      tagsByItemId.set(item.id, item.tags)
    }
  }

  logger.debug(
    `Processing ${instanceItems.length} items in ${adapter.type} instance ${adapter.name} for bulk tagging`,
  )

  const addUpdates: ItemTagUpdate[] = []
  const removeUpdates: ItemTagUpdate[] = []
  const results = emptyResults()

  for (const item of instanceItems) {
    try {
      const itemUsers = Array.from(usersForGuids(guidIndex, item.guids)).filter(
        (userId) => userTagIdByUser.has(userId),
      )

      if (itemUsers.length === 0 && settings.removedTagMode === 'keep') {
        results.skipped++
        continue
      }

      const itemId = adapter.extractItemId(item.guids)
      if (itemId === 0) {
        logger.debug(
          `Could not extract ${adapter.type} ID from "${item.title}", skipping tagging`,
        )
        results.skipped++
        continue
      }

      const existingTags = tagsByItemId.get(itemId)
      if (!existingTags) {
        logger.debug(
          `Item details not found for "${item.title}" (ID: ${itemId}), skipping`,
        )
        results.skipped++
        continue
      }

      const userTagIds = itemUsers.flatMap((userId) => {
        const tagId = userTagIdByUser.get(userId)
        return tagId ? [tagId] : []
      })

      const diff = computeTagDiffs({
        existingTags,
        userTagIds,
        tagIdMap,
        mode: settings.removedTagMode,
        tagPrefix: settings.tagPrefix,
        removedTagPrefix: settings.removedTagPrefix,
      })
      if (diff.addRemovedTag) {
        diff.toAdd.push(
          await ensureRemovedTag(
            adapter,
            settings.removedTagPrefix,
            tagLabelMap,
            tagIdMap,
            `"${item.title}"`,
            deps,
          ),
        )
      }

      if (diff.toAdd.length > 0) {
        addUpdates.push({ itemId, tagIds: diff.toAdd })
      }
      if (diff.toRemove.length > 0) {
        removeUpdates.push({ itemId, tagIds: diff.toRemove })
      }
      if (diff.toAdd.length === 0 && diff.toRemove.length === 0) {
        results.skipped++
      }
    } catch (itemError) {
      logger.error({ error: itemError }, `Error processing "${item.title}":`)
      results.failed++
    }
  }

  if (addUpdates.length > 0) {
    await adapter.bulkUpdateTags(addUpdates, 'add')
  }
  if (removeUpdates.length > 0) {
    await adapter.bulkUpdateTags(removeUpdates, 'remove')
  }
  results.tagged += new Set(
    [...addUpdates, ...removeUpdates].map((update) => update.itemId),
  ).size

  logger.debug(
    `Completed bulk tagging for ${adapter.type} instance ${adapter.name}: Processed ${instanceItems.length} items (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
  )

  return results
}

export interface TagContentParams {
  type: ArrType
  items: LibraryItem[]
  watchlistItems: WatchlistGuidItem[]
}

export async function tagContentWithData(
  params: TagContentParams,
  deps: UserTagDeps,
): Promise<TaggingResults> {
  const { type, items, watchlistItems } = params
  const source = getArrSource(type, deps)
  if (!isTaggingEnabled(deps.config, type)) {
    deps.logger.debug(
      `${source.displayName} user tagging disabled, skipping content tagging`,
    )
    return emptyResults()
  }

  try {
    const instances = await source.getInstances()
    const guidIndex = buildGuidIndex(watchlistItems)
    const settings = getTagSettings(deps.config)

    const instanceResults = await Promise.all(
      instances.map(async (instance) => {
        try {
          const adapter = source.getAdapter(instance)
          if (!adapter) {
            deps.logger.warn(
              `${source.displayName} service for instance ${instance.name} not found, skipping tagging`,
            )
            return emptyResults()
          }
          return await tagInstance(
            { adapter, items, guidIndex, settings },
            deps,
          )
        } catch (instanceError) {
          deps.logger.error(
            { error: instanceError },
            `Error processing ${source.displayName} instance ${instance.name} for tagging:`,
          )
          return emptyResults()
        }
      }),
    )

    return instanceResults.reduce(
      (total, result) => ({
        tagged: total.tagged + result.tagged,
        skipped: total.skipped + result.skipped,
        failed: total.failed + result.failed,
      }),
      emptyResults(),
    )
  } catch (error) {
    deps.logger.error({ error }, `Error tagging ${source.displayName} content:`)
    throw error
  }
}

export async function syncTags(
  type: ArrType,
  deps: UserTagDeps,
): Promise<TaggingResults> {
  const source = getArrSource(type, deps)
  if (!isTaggingEnabled(deps.config, type)) {
    deps.logger.debug(
      `${source.displayName} user tagging disabled, skipping content tagging`,
    )
    return emptyResults()
  }

  const progressType = `${type}-tagging` as const
  const operationId = `${progressType}-${Date.now()}`
  const { progress } = deps.fastify
  const emitProgress = progress.hasActiveConnections()
  const { displayName, itemNoun } = source

  try {
    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'start',
        progress: 5,
        message: `Starting ${displayName} tag synchronization...`,
      })
    }

    // The migration rewrites tag ids on arr items, so the library must be read after it.
    await ensureMigrationComplete(type, deps)

    const library = await source.fetchLibrary()
    const watchlistItems = await source.watchlistItemsForType()

    const results = await tagContentWithData(
      { type, items: library, watchlistItems },
      deps,
    )
    const total = library.length

    if (emitProgress && total > 0) {
      progress.emit({
        operationId,
        type: progressType,
        phase: `tagging-${itemNoun}`,
        progress: 95,
        message: `Tagged ${total}/${total} ${itemNoun}`,
      })
    }

    deps.logger.info(
      `Completed tagging for ${displayName} instance. ${displayName}: Processed ${total} ${itemNoun} (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
    )

    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'complete',
        progress: 100,
        message: `Completed ${displayName} tag sync: tagged ${results.tagged} ${itemNoun}, skipped ${results.skipped}, failed ${results.failed}`,
      })
    }

    await deps.migration.cleanupMigrationFileIfComplete()
    return results
  } catch (error) {
    deps.logger.error({ error }, `Error syncing ${displayName} tags:`)

    if (emitProgress) {
      progress.emit({
        operationId,
        type: progressType,
        phase: 'error',
        progress: 100,
        message: `Error syncing ${displayName} tags: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }

    throw error
  }
}

export async function syncAllTags(deps: UserTagDeps): Promise<SyncAllResults> {
  deps.logger.info('Starting complete user tag synchronization')

  try {
    const [sonarr, radarr] = await Promise.all([
      syncTags('sonarr', deps),
      syncTags('radarr', deps),
    ])

    let orphanedCleanup: OrphanedTagCleanupResults | undefined
    if (deps.config.cleanupOrphanedTags) {
      try {
        orphanedCleanup = await cleanupOrphanedUserTags(deps)
        deps.logger.info(
          {
            sonarr: {
              removed: orphanedCleanup.sonarr.removed,
              failed: orphanedCleanup.sonarr.failed,
            },
            radarr: {
              removed: orphanedCleanup.radarr.removed,
              failed: orphanedCleanup.radarr.failed,
            },
          },
          'Orphaned user tag cleanup summary',
        )
      } catch (cleanupError) {
        deps.logger.error(
          { error: cleanupError },
          'Error during orphaned tag cleanup:',
        )
      }
    }

    deps.logger.info({ sonarr, radarr }, 'User tag synchronization summary')

    return { sonarr, radarr, orphanedCleanup }
  } catch (error) {
    deps.logger.error({ error }, 'Error in tag synchronization:')
    throw error
  }
}
