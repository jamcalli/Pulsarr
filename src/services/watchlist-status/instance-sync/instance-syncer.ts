/**
 * Instance Syncer
 *
 * Unified sync logic for copying content to non-default *arr instances.
 * Uses bulk queries to fix N+1 performance issues.
 */

import type { User } from '@root/types/config.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import type { BatchCopyItem } from './batch-processor.js'
import { processBatchCopy } from './batch-processor.js'

/**
 * Dependencies for instance sync operations
 */
export interface InstanceSyncerDeps {
  db: DatabaseService
  contentRouter: ContentRouterService
  logger: FastifyBaseLogger
}

/**
 * Progress event emitter callback
 */
export type ProgressEmitter = (event: {
  operationId: string
  type: 'sync'
  phase: 'start' | 'copying' | 'complete'
  progress: number
  message: string
}) => void

/**
 * Base instance type with sync configuration
 */
interface SyncableInstance {
  id: number
  syncedInstances?: number[] | string | null
}

/**
 * Watchlist item with flexible id type (string from DB, converted to number)
 */
interface WatchlistItemInput {
  id?: string | number
  user_id: number
  title: string
  key: string
  type: string
  guids?: string[] | string
  genres?: string[] | string
  status: string
  thumb?: string | null
  added?: string | null
}

/**
 * Result of building items to copy
 */
interface ItemsToCopyResult<TContent> {
  itemsToCopy: Array<{
    item: DatabaseWatchlistItem
    matchingContent: TContent
  }>
}

/**
 * Configuration for syncing a specific content type
 */
export interface InstanceSyncConfig<
  TContent extends SonarrItem | RadarrItem,
  TInstance extends SyncableInstance,
> {
  contentType: 'movie' | 'show'
  contentLabel: string // "Movie" or "Show" for logging
  contentLabelPlural: string // "movies" or "shows" for logging

  // Instance operations
  getInstance: (id: number) => Promise<TInstance | null>
  getDefaultInstance: () => Promise<TInstance | null>

  // Content operations
  getWatchlistItems: () => Promise<WatchlistItemInput[]>
  getAllContent: () => Promise<TContent[]>
  getContentInstanceId: (content: TContent) => number | undefined

  // Junction operations
  getAllJunctions: (
    watchlistIds: number[],
  ) => Promise<Array<{ watchlist_id: number; instance_id: number }>>
  addToInstance: (
    watchlistId: number,
    instanceId: number,
    status: string,
    isPrimary: boolean,
  ) => Promise<void>

  // Content matching
  findMatch: (
    allContent: TContent[],
    guids: string[] | string | null | undefined,
  ) => TContent | null
}

/**
 * Syncs content to a target instance with N+1 query fixes.
 * Uses bulk junction queries and Map-based lookups for O(n) performance.
 */
export async function syncInstance<
  TContent extends SonarrItem | RadarrItem,
  TInstance extends SyncableInstance,
>(
  deps: InstanceSyncerDeps,
  config: InstanceSyncConfig<TContent, TInstance>,
  instanceId: number,
  emitProgress?: ProgressEmitter,
): Promise<number> {
  const { db, contentRouter, logger } = deps
  const {
    contentType,
    contentLabel,
    contentLabelPlural,
    getInstance,
    getDefaultInstance,
    getWatchlistItems,
    getAllContent,
    getContentInstanceId,
    getAllJunctions,
    addToInstance,
    findMatch,
  } = config

  const operationId = `${contentType}-instance-sync-${instanceId}-${Date.now()}`

  try {
    if (emitProgress) {
      emitProgress({
        operationId,
        type: 'sync',
        phase: 'start',
        progress: 0,
        message: `Initializing ${contentLabel} sync for instance ${instanceId}...`,
      })
    }

    logger.info(`Starting sync for ${contentLabel} instance ${instanceId}`)
    const instance = await getInstance(instanceId)
    if (!instance) {
      throw new Error(`${contentLabel} instance ${instanceId} not found`)
    }

    const defaultInstance = await getDefaultInstance()

    // Determine if this instance should receive content from the default instance
    const shouldSyncFromDefault = Boolean(
      defaultInstance &&
        defaultInstance.id !== instanceId &&
        Array.isArray(defaultInstance.syncedInstances) &&
        defaultInstance.syncedInstances.includes(instanceId),
    )

    logger.debug(
      `Should sync from default to this instance: ${shouldSyncFromDefault}`,
    )

    // Get all watchlist items
    const watchlistItems = await getWatchlistItems()

    // Deduplicate by GUID to get unique media items
    // Convert WatchlistItemInput to DatabaseWatchlistItem format
    const uniqueByGuid = new Map<string, WatchlistItemInput>()
    for (const item of watchlistItems) {
      const guids = parseGuids(item.guids)
      if (guids.length > 0 && !uniqueByGuid.has(guids[0])) {
        uniqueByGuid.set(guids[0], item)
      }
    }
    const uniqueWatchlistItems = Array.from(uniqueByGuid.values())
    logger.info(
      `Deduplicated watchlist items from ${watchlistItems.length} to ${uniqueWatchlistItems.length} unique media items`,
    )

    // Get all existing content across all instances
    const allExistingContent = await getAllContent()

    // Get content already in the target instance
    const existingInInstance = allExistingContent.filter(
      (content) => getContentInstanceId(content) === instanceId,
    )

    // Create a map of GUIDs for quick lookup
    const existingGuidMap = new Set<string>()
    for (const content of existingInInstance) {
      const guids = parseGuids((content as SonarrItem | RadarrItem).guids)
      for (const guid of guids) {
        existingGuidMap.add(guid)
      }
    }

    // PERF FIX: Bulk fetch all junction data to avoid N+1 queries
    const watchlistIds = uniqueWatchlistItems
      .map((item) =>
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id,
      )
      .filter((id): id is number => id !== undefined && !Number.isNaN(id))

    const allJunctions = await getAllJunctions(watchlistIds)

    // Build a Map for O(1) lookups: watchlistId -> instanceIds[]
    const instanceIdsByWatchlist = new Map<number, number[]>()
    for (const junction of allJunctions) {
      const existing = instanceIdsByWatchlist.get(junction.watchlist_id) || []
      existing.push(junction.instance_id)
      instanceIdsByWatchlist.set(junction.watchlist_id, existing)
    }

    // Parse synced instances once
    const syncedInstances = parseSyncedInstances(instance.syncedInstances)

    // Build items to copy
    const { itemsToCopy } = await buildItemsToCopy({
      uniqueWatchlistItems,
      instanceId,
      defaultInstance,
      shouldSyncFromDefault,
      syncedInstances,
      instanceIdsByWatchlist,
      existingGuidMap,
      allExistingContent,
      findMatch,
      addToInstance,
      logger,
      contentLabel,
    })

    let itemsCopied = 0

    if (itemsToCopy.length > 0) {
      if (emitProgress) {
        emitProgress({
          operationId,
          type: 'sync',
          phase: 'copying',
          progress: 5,
          message: `Starting to process ${itemsToCopy.length} ${contentLabelPlural} for instance ${instanceId}`,
        })
      }

      // Pre-fetch users to avoid N+1 queries
      const userIds = new Set(itemsToCopy.map(({ item }) => item.user_id))
      const allUsers = await db.getAllUsers()
      const userMap = new Map<number, User>(
        allUsers.filter((u) => userIds.has(u.id)).map((u) => [u.id, u]),
      )

      // Build batch items
      const batchItems: BatchCopyItem[] = itemsToCopy.map(
        ({ item, matchingContent }) => ({
          item,
          matchingContent,
        }),
      )

      // Use p-limit batch processor
      itemsCopied = await processBatchCopy(
        { contentRouter, logger },
        batchItems,
        instanceId,
        contentType,
        userMap,
        emitProgress
          ? (completed, total) => {
              const progress = Math.min(
                5 + Math.floor((completed / total) * 90),
                95,
              )
              emitProgress({
                operationId,
                type: 'sync',
                phase: 'copying',
                progress,
                message: `Copied ${completed} of ${total} ${contentLabelPlural} to instance ${instanceId}`,
              })
            }
          : undefined,
      )

      if (emitProgress) {
        emitProgress({
          operationId,
          type: 'sync',
          phase: 'complete',
          progress: 100,
          message: `Completed sync for instance ${instanceId}, copied ${itemsCopied} items`,
        })
      }
    } else {
      if (emitProgress) {
        emitProgress({
          operationId,
          type: 'sync',
          phase: 'complete',
          progress: 100,
          message: `No items needed to be copied to instance ${instanceId}`,
        })
      }
    }

    logger.info(
      `Completed sync for ${contentLabel} instance ${instanceId}, copied ${itemsCopied} items`,
    )
    return itemsCopied
  } catch (error) {
    logger.error(
      { error, instanceId },
      `Error syncing ${contentLabel} instance`,
    )
    throw error
  }
}

/**
 * Parse synced instances from various formats
 */
function parseSyncedInstances(
  syncedInstances: number[] | string | null | undefined,
): number[] {
  if (Array.isArray(syncedInstances)) {
    return syncedInstances
  }
  if (typeof syncedInstances === 'string') {
    try {
      return JSON.parse(syncedInstances || '[]')
    } catch {
      return []
    }
  }
  return []
}

/**
 * Build the list of items that need to be copied
 */
async function buildItemsToCopy<
  TContent extends SonarrItem | RadarrItem,
>(params: {
  uniqueWatchlistItems: WatchlistItemInput[]
  instanceId: number
  defaultInstance: SyncableInstance | null
  shouldSyncFromDefault: boolean
  syncedInstances: number[]
  instanceIdsByWatchlist: Map<number, number[]>
  existingGuidMap: Set<string>
  allExistingContent: TContent[]
  findMatch: (
    allContent: TContent[],
    guids: string[] | string | null | undefined,
  ) => TContent | null
  addToInstance: (
    watchlistId: number,
    instanceId: number,
    status: string,
    isPrimary: boolean,
  ) => Promise<void>
  logger: FastifyBaseLogger
  contentLabel: string
}): Promise<ItemsToCopyResult<TContent>> {
  const {
    uniqueWatchlistItems,
    instanceId,
    defaultInstance,
    shouldSyncFromDefault,
    syncedInstances,
    instanceIdsByWatchlist,
    existingGuidMap,
    allExistingContent,
    findMatch,
    addToInstance,
    logger,
    contentLabel,
  } = params

  const itemsToCopy: Array<{
    item: DatabaseWatchlistItem
    matchingContent: TContent
  }> = []

  for (const item of uniqueWatchlistItems) {
    try {
      if (item.id === undefined) continue

      // Convert id to number
      const numericId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id
      if (Number.isNaN(numericId)) continue

      // Get current instance IDs from pre-fetched Map (O(1) lookup)
      const currentInstanceIds = instanceIdsByWatchlist.get(numericId) || []

      // Skip if already in target instance
      if (currentInstanceIds.includes(instanceId)) continue

      // Determine if item should be in this instance
      let shouldBeInInstance = false

      if (shouldSyncFromDefault && defaultInstance) {
        if (currentInstanceIds.includes(defaultInstance.id)) {
          shouldBeInInstance = true
          logger.debug(
            `${contentLabel} ${item.title} should be synced from default instance ${defaultInstance.id}`,
          )
        }
      }

      // Check if item is in any instance that syncs to this one
      if (!shouldBeInInstance) {
        for (const syncedId of syncedInstances) {
          if (currentInstanceIds.includes(syncedId)) {
            shouldBeInInstance = true
            logger.debug(
              `${contentLabel} ${item.title} should be synced from instance ${syncedId}`,
            )
            break
          }
        }
      }

      if (shouldBeInInstance) {
        const itemGuids = parseGuids(item.guids)
        const alreadyExists = itemGuids.some((guid) =>
          existingGuidMap.has(guid),
        )

        if (alreadyExists) {
          logger.debug(
            `${contentLabel} ${item.title} exists in instance ${instanceId} but not in junction table, updating database`,
          )
          await addToInstance(
            numericId,
            instanceId,
            'pending',
            currentInstanceIds.length === 0,
          )
          continue
        }

        // Find matching content in other instances
        const matchingContent = findMatch(allExistingContent, item.guids)
        if (matchingContent) {
          // Convert to DatabaseWatchlistItem format
          const dbItem: DatabaseWatchlistItem = {
            id: numericId,
            user_id: item.user_id,
            title: item.title,
            key: item.key,
            type: item.type,
            guids: item.guids ?? undefined,
            genres: item.genres ?? undefined,
            status: item.status as DatabaseWatchlistItem['status'],
            thumb: item.thumb,
            added: item.added,
          }
          itemsToCopy.push({ item: dbItem, matchingContent })
        } else {
          logger.debug(
            `No matching ${contentLabel.toLowerCase()} found for ${item.title} to copy to instance ${instanceId}`,
          )
        }
      }
    } catch (itemError) {
      logger.error(
        {
          error:
            itemError instanceof Error
              ? itemError
              : new Error(String(itemError)),
          title: item.title,
        },
        `Error processing ${contentLabel.toLowerCase()} during analysis`,
      )
    }
  }

  return { itemsToCopy }
}

/**
 * Creates a Radarr sync configuration
 */
export function createRadarrSyncConfig(
  db: DatabaseService,
  radarrManager: { fetchAllMovies: () => Promise<RadarrItem[]> },
  findMatch: (
    allContent: RadarrItem[],
    guids: string[] | string | null | undefined,
  ) => RadarrItem | null,
): InstanceSyncConfig<RadarrItem, SyncableInstance> {
  return {
    contentType: 'movie',
    contentLabel: 'Movie',
    contentLabelPlural: 'movies',
    getInstance: async (id) => {
      const instance = await db.getRadarrInstance(id)
      return instance
        ? { ...instance, syncedInstances: instance.syncedInstances ?? null }
        : null
    },
    getDefaultInstance: async () => {
      const instance = await db.getDefaultRadarrInstance()
      return instance
        ? { ...instance, syncedInstances: instance.syncedInstances ?? null }
        : null
    },
    getWatchlistItems: () => db.getAllMovieWatchlistItems(),
    getAllContent: () => radarrManager.fetchAllMovies(),
    getContentInstanceId: (content) => content.radarr_instance_id,
    getAllJunctions: async (watchlistIds) => {
      const junctions =
        await db.getAllWatchlistRadarrInstanceJunctions(watchlistIds)
      return junctions.map((j) => ({
        watchlist_id: j.watchlist_id,
        instance_id: j.radarr_instance_id,
      }))
    },
    addToInstance: (watchlistId, instanceId, status, isPrimary) =>
      db.addWatchlistToRadarrInstance(
        watchlistId,
        instanceId,
        status as 'pending' | 'requested' | 'grabbed' | 'notified',
        isPrimary,
      ),
    findMatch,
  }
}

/**
 * Creates a Sonarr sync configuration
 */
export function createSonarrSyncConfig(
  db: DatabaseService,
  sonarrManager: { fetchAllSeries: () => Promise<SonarrItem[]> },
  findMatch: (
    allContent: SonarrItem[],
    guids: string[] | string | null | undefined,
  ) => SonarrItem | null,
): InstanceSyncConfig<SonarrItem, SyncableInstance> {
  return {
    contentType: 'show',
    contentLabel: 'Show',
    contentLabelPlural: 'shows',
    getInstance: async (id) => {
      const instance = await db.getSonarrInstance(id)
      return instance
        ? { ...instance, syncedInstances: instance.syncedInstances ?? null }
        : null
    },
    getDefaultInstance: async () => {
      const instance = await db.getDefaultSonarrInstance()
      return instance
        ? { ...instance, syncedInstances: instance.syncedInstances ?? null }
        : null
    },
    getWatchlistItems: () => db.getAllShowWatchlistItems(),
    getAllContent: () => sonarrManager.fetchAllSeries(),
    getContentInstanceId: (content) => content.sonarr_instance_id,
    getAllJunctions: async (watchlistIds) => {
      const junctions =
        await db.getAllWatchlistSonarrInstanceJunctions(watchlistIds)
      return junctions.map((j) => ({
        watchlist_id: j.watchlist_id,
        instance_id: j.sonarr_instance_id,
      }))
    },
    addToInstance: (watchlistId, instanceId, status, isPrimary) =>
      db.addWatchlistToSonarrInstance(
        watchlistId,
        instanceId,
        status as 'pending' | 'requested' | 'grabbed' | 'notified',
        isPrimary,
      ),
    findMatch,
  }
}
