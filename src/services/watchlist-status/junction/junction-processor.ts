/**
 * Junction Processor
 *
 * Unified processor for junction table updates between watchlist items and *arr instances.
 * Handles both Sonarr and Radarr junctions with a generic approach.
 */

import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type {
  DatabaseWatchlistItem,
  JunctionUpdateResult,
  WatchlistInstanceStatus,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  buildGuidIndex,
  extractSonarrId,
  findBestGuidMatch,
  parseGuids,
} from '@utils/guid-handler.js'
import { isStatusUpgrade } from '@utils/watchlist-status-rank.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies required for junction processing
 */
export interface JunctionProcessorDeps {
  logger: FastifyBaseLogger
}

/**
 * Generic junction entry from database
 */
interface JunctionEntry {
  watchlist_id: number
  status: WatchlistStatus
  is_primary: boolean
  last_notified_at: string | null
}

/**
 * Sonarr-specific junction entry (matches DB return type)
 */
interface SonarrJunctionEntry extends JunctionEntry {
  sonarr_instance_id: number
  sonarr_series_id: number | null
}

/**
 * Radarr-specific junction entry (matches DB return type)
 */
interface RadarrJunctionEntry extends JunctionEntry {
  radarr_instance_id: number
}

/**
 * Configuration for content-type specific operations
 */
interface JunctionConfig<
  TItem extends SonarrItem | RadarrItem,
  TEntry extends SonarrJunctionEntry | RadarrJunctionEntry,
> {
  contentType: 'show' | 'movie'
  /** Get the instance ID from an *arr item */
  getItemInstanceId: (item: TItem) => number | undefined
  /** Get the instance ID from a junction entry */
  getEntryInstanceId: (entry: TEntry) => number
  /** Series id to write, or undefined when the entry already holds it */
  getSeriesIdToWrite?: (
    item: TItem,
    entry: TEntry | undefined,
  ) => number | undefined
  /** Fetch all junction entries for the given watchlist IDs */
  fetchJunctions: (watchlistIds: number[]) => Promise<TEntry[]>
  /** Bulk add junction entries */
  bulkAdd: (
    entries: Array<{
      watchlist_id: number
      instance_id: number
      status: WatchlistStatus
      is_primary: boolean
      last_notified_at?: string
      sonarr_series_id?: number
    }>,
  ) => Promise<void>
  /** Bulk update junction entries */
  bulkUpdate: (
    entries: Array<{
      watchlist_id: number
      instance_id: number
      status?: WatchlistStatus
      is_primary?: boolean
      last_notified_at?: string
      sonarr_series_id?: number
    }>,
  ) => Promise<void>
  /** Bulk remove junction entries */
  bulkRemove: (
    entries: Array<{
      watchlist_id: number
      instance_id: number
    }>,
  ) => Promise<void>
}

/**
 * Validates and normalizes a status value
 */
function validateStatus(status: string | undefined): WatchlistStatus {
  const validStatuses: WatchlistStatus[] = [
    'pending',
    'requested',
    'grabbed',
    'notified',
  ]
  if (status && validStatuses.includes(status as WatchlistStatus)) {
    return status as WatchlistStatus
  }
  return 'pending'
}

/**
 * Processes junction table updates for watchlist items.
 * Unified implementation for both Sonarr and Radarr.
 *
 * Performance optimizations:
 * - O(n) Map-based lookups instead of O(n²) filtering
 * - Set-based instance tracking for O(1) lookups
 * - Bulk database operations
 */
export async function processJunctionUpdates<
  TItem extends SonarrItem | RadarrItem,
  TEntry extends SonarrJunctionEntry | RadarrJunctionEntry,
>(
  deps: JunctionProcessorDeps,
  config: JunctionConfig<TItem, TEntry>,
  arrItems: TItem[],
  watchlistItems: DatabaseWatchlistItem[],
): Promise<JunctionUpdateResult<TItem>> {
  let updateCount = 0
  const userIds = new Set<number>()
  const matches = new Map<number, TItem[]>()

  try {
    // 1. Extract all watchlist IDs we need to process
    const watchlistIds = watchlistItems
      .filter((item) => item.id !== undefined)
      .map((item) => item.id as number)

    if (watchlistIds.length === 0) return { updated: 0, userIds: [], matches }

    // 2. Prefetch ALL current junction associations in a single query
    const allJunctionEntries = await config.fetchJunctions(watchlistIds)

    // 3. Create lookup maps for efficient access - O(n) instead of O(n²)
    const junctionMap = new Map<string, WatchlistInstanceStatus>()
    const entriesByWatchlistId = new Map<number, TEntry[]>()

    for (const entry of allJunctionEntries) {
      const instanceId = config.getEntryInstanceId(entry)
      const key = `${entry.watchlist_id}-${instanceId}`
      junctionMap.set(key, {
        status: validateStatus(entry.status),
        is_primary: entry.is_primary,
        last_notified_at: entry.last_notified_at,
      })

      // Build index by watchlist_id for O(1) lookups later
      const existing = entriesByWatchlistId.get(entry.watchlist_id) || []
      existing.push(entry)
      entriesByWatchlistId.set(entry.watchlist_id, existing)
    }

    // 4. Group *arr items by instance
    const instanceItemMap = new Map<number, TItem[]>()
    for (const item of arrItems) {
      const instanceId = config.getItemInstanceId(item)
      if (instanceId) {
        const existing = instanceItemMap.get(instanceId) || []
        existing.push(item)
        instanceItemMap.set(instanceId, existing)
      }
    }
    const instanceIndexes = [...instanceItemMap].map(
      ([instanceId, instanceItems]) =>
        [instanceId, buildGuidIndex(instanceItems)] as const,
    )

    // 5. Prepare batch operation collections
    const junctionsToAdd: Array<{
      watchlist_id: number
      instance_id: number
      status: WatchlistStatus
      is_primary: boolean
      last_notified_at?: string
      sonarr_series_id?: number
    }> = []

    const junctionsToUpdate: Array<{
      watchlist_id: number
      instance_id: number
      status?: WatchlistStatus
      is_primary?: boolean
      last_notified_at?: string
      sonarr_series_id?: number
    }> = []

    const junctionsToRemove: Array<{
      watchlist_id: number
      instance_id: number
    }> = []

    // Track watchlist IDs with planned primaries for O(1) lookups
    const plannedPrimarySet = new Set<number>()

    // 6. Process each watchlist item
    for (const item of watchlistItems) {
      if (item.id === undefined) continue

      const countBeforeItem = updateCount
      const numericId = item.id as number
      const mainTableStatus = item.status

      // Use Set for O(1) lookups instead of Array.includes()
      const existingInstanceSet = new Set<number>()
      const currentInstanceSet = new Set<number>()

      // Build set of current instance associations - O(1) lookup from pre-built index
      const itemEntries = entriesByWatchlistId.get(numericId) || []
      for (const entry of itemEntries) {
        currentInstanceSet.add(config.getEntryInstanceId(entry))
      }

      const itemGuids = parseGuids(item.guids)

      for (const [instanceId, instanceIndex] of instanceIndexes) {
        const matchingItem = findBestGuidMatch(instanceIndex, itemGuids)

        if (matchingItem) {
          existingInstanceSet.add(instanceId)
          const rowMatches = matches.get(numericId)
          if (rowMatches) rowMatches.push(matchingItem)
          else matches.set(numericId, [matchingItem])
          const junctionKey = `${numericId}-${instanceId}`
          const currentJunction = junctionMap.get(junctionKey)

          // Add to junction if not exists
          if (!currentJunction) {
            const hasPlannedPrimary = plannedPrimarySet.has(numericId)
            const isPrimary =
              currentInstanceSet.size === 0 &&
              existingInstanceSet.size === 1 &&
              !hasPlannedPrimary

            junctionsToAdd.push({
              watchlist_id: numericId,
              instance_id: instanceId,
              status:
                mainTableStatus === 'notified'
                  ? 'notified'
                  : validateStatus(matchingItem.status),
              is_primary: isPrimary,
              sonarr_series_id: config.getSeriesIdToWrite?.(
                matchingItem,
                undefined,
              ),
            })

            if (isPrimary) {
              plannedPrimarySet.add(numericId)
            }
            updateCount++
          } else {
            // Update junction if needed
            const updates: {
              watchlist_id: number
              instance_id: number
              status?: WatchlistStatus
              is_primary?: boolean
              last_notified_at?: string
              sonarr_series_id?: number
            } = {
              watchlist_id: numericId,
              instance_id: instanceId,
            }

            let needsUpdate = false

            // Status update logic
            if (
              mainTableStatus === 'notified' &&
              currentJunction.status !== 'notified'
            ) {
              updates.status = 'notified'
              updates.last_notified_at =
                currentJunction.last_notified_at || undefined
              needsUpdate = true
            } else {
              const arrStatus = validateStatus(matchingItem.status)
              if (isStatusUpgrade(currentJunction.status, arrStatus)) {
                updates.status = arrStatus
                needsUpdate = true
              }
            }

            const seriesId = config.getSeriesIdToWrite?.(
              matchingItem,
              itemEntries.find(
                (entry) => config.getEntryInstanceId(entry) === instanceId,
              ),
            )
            if (seriesId !== undefined) {
              updates.sonarr_series_id = seriesId
              needsUpdate = true
            }

            if (needsUpdate) {
              junctionsToUpdate.push(updates)
              updateCount++
            }
          }
        }
      }

      // Clean up instances where content no longer exists - O(1) Set lookups
      for (const instanceId of currentInstanceSet) {
        if (!existingInstanceSet.has(instanceId)) {
          junctionsToRemove.push({
            watchlist_id: numericId,
            instance_id: instanceId,
          })
          updateCount++
        }
      }

      // Ensure primary instance is set correctly
      if (existingInstanceSet.size > 0) {
        const hasPrimary = itemEntries
          .filter((entry) =>
            existingInstanceSet.has(config.getEntryInstanceId(entry)),
          )
          .some((entry) => entry.is_primary)

        const hasPlannedPrimary = plannedPrimarySet.has(numericId)

        if (!hasPrimary && !hasPlannedPrimary) {
          const firstInstance = existingInstanceSet.values().next().value
          if (firstInstance !== undefined) {
            junctionsToUpdate.push({
              watchlist_id: numericId,
              instance_id: firstInstance,
              is_primary: true,
            })
            updateCount++
          }
        }
      }

      if (updateCount > countBeforeItem) userIds.add(item.user_id)
    }

    // 7. Execute all batch operations
    if (junctionsToAdd.length > 0) {
      await config.bulkAdd(junctionsToAdd)
      deps.logger.debug(
        `Added ${junctionsToAdd.length} ${config.contentType} junction records in bulk`,
      )
    }

    if (junctionsToUpdate.length > 0) {
      await config.bulkUpdate(junctionsToUpdate)
      deps.logger.debug(
        `Updated ${junctionsToUpdate.length} ${config.contentType} junction records in bulk`,
      )
    }

    if (junctionsToRemove.length > 0) {
      await config.bulkRemove(junctionsToRemove)
      deps.logger.debug(
        `Removed ${junctionsToRemove.length} ${config.contentType} junction records in bulk`,
      )
    }

    return { updated: updateCount, userIds: [...userIds], matches }
  } catch (error) {
    deps.logger.error(
      { error },
      `Error in bulk processing ${config.contentType} junction updates:`,
    )
    throw error
  }
}

/**
 * Creates a Sonarr junction configuration
 */
export function createSonarrJunctionConfig(
  db: DatabaseService,
): JunctionConfig<SonarrItem, SonarrJunctionEntry> {
  return {
    contentType: 'show',
    getItemInstanceId: (item) => item.sonarr_instance_id,
    getEntryInstanceId: (entry) => entry.sonarr_instance_id,
    getSeriesIdToWrite: (item, entry) => {
      const seriesId = extractSonarrId(item.guids)
      return seriesId > 0 && entry?.sonarr_series_id !== seriesId
        ? seriesId
        : undefined
    },
    fetchJunctions: (ids) => db.getAllWatchlistSonarrInstanceJunctions(ids),
    bulkAdd: (entries) =>
      db.bulkAddWatchlistToSonarrInstances(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          sonarr_instance_id: e.instance_id,
          status: e.status,
          is_primary: e.is_primary,
          last_notified_at: e.last_notified_at,
          sonarr_series_id: e.sonarr_series_id,
        })),
      ),
    bulkUpdate: (entries) =>
      db.bulkUpdateWatchlistSonarrInstanceStatuses(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          sonarr_instance_id: e.instance_id,
          status: e.status,
          is_primary: e.is_primary,
          last_notified_at: e.last_notified_at,
          sonarr_series_id: e.sonarr_series_id,
        })),
      ),
    bulkRemove: (entries) =>
      db.bulkRemoveWatchlistFromSonarrInstances(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          sonarr_instance_id: e.instance_id,
        })),
      ),
  }
}

/**
 * Creates a Radarr junction configuration
 */
export function createRadarrJunctionConfig(
  db: DatabaseService,
): JunctionConfig<RadarrItem, RadarrJunctionEntry> {
  return {
    contentType: 'movie',
    getItemInstanceId: (item) => item.radarr_instance_id,
    getEntryInstanceId: (entry) => entry.radarr_instance_id,
    fetchJunctions: (ids) => db.getAllWatchlistRadarrInstanceJunctions(ids),
    bulkAdd: (entries) =>
      db.bulkAddWatchlistToRadarrInstances(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          radarr_instance_id: e.instance_id,
          status: e.status,
          is_primary: e.is_primary,
          last_notified_at: e.last_notified_at,
        })),
      ),
    bulkUpdate: (entries) =>
      db.bulkUpdateWatchlistRadarrInstanceStatuses(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          radarr_instance_id: e.instance_id,
          status: e.status,
          is_primary: e.is_primary,
          last_notified_at: e.last_notified_at,
        })),
      ),
    bulkRemove: (entries) =>
      db.bulkRemoveWatchlistFromRadarrInstances(
        entries.map((e) => ({
          watchlist_id: e.watchlist_id,
          radarr_instance_id: e.instance_id,
        })),
      ),
  }
}
