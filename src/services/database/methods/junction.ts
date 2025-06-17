import type { DatabaseService } from '@services/database.service.js'
import type { WatchlistInstanceStatus } from '@root/types/watchlist-status.types.js'
import type { Knex } from 'knex'

/**
 * Retrieves all Radarr instance IDs associated with a watchlist item
 *
 * This method queries the watchlist_radarr_instances junction table to find
 * all Radarr instances that a particular watchlist item is associated with.
 * This is essential for multi-instance deployments where content may be
 * distributed across several Radarr instances.
 *
 * @param watchlistId - ID of the watchlist item
 * @returns Promise resolving to array of Radarr instance IDs
 */
export async function getWatchlistRadarrInstanceIds(
  this: DatabaseService,
  watchlistId: number,
  trx?: Knex.Transaction,
): Promise<number[]> {
  try {
    const query = trx || this.knex
    const result = await query('watchlist_radarr_instances')
      .select('radarr_instance_id')
      .where({ watchlist_id: watchlistId })

    return result.map((r) => r.radarr_instance_id)
  } catch (error) {
    this.log.error(
      `Error getting Radarr instance IDs for watchlist ${watchlistId}:`,
      error,
    )
    return []
  }
}

/**
 * Retrieves the instance status for a watchlist item in Radarr
 *
 * Queries the junction table to get detailed status information about how a specific
 * watchlist item is configured in a particular Radarr instance.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @returns Promise resolving to the status information if found, null otherwise
 */
export async function getWatchlistRadarrInstanceStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<WatchlistInstanceStatus | null> {
  try {
    const result = await this.knex('watchlist_radarr_instances')
      .select('status', 'last_notified_at', 'is_primary')
      .where({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
      })
      .first()

    return result || null
  } catch (error) {
    this.log.error(
      `Error getting Radarr instance status for watchlist ${watchlistId}, instance ${instanceId}:`,
      error,
    )
    return null
  }
}

/**
 * Adds a watchlist item to a Radarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @param status - Optional initial status
 * @param isPrimary - Whether this instance is primary for the item
 * @param syncing - Whether the item is currently syncing
 * @returns Promise resolving to void when complete
 */
export async function addWatchlistToRadarrInstance(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified' = 'pending',
  isPrimary = false,
  syncing = false,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const query = trx || this.knex
    await query('watchlist_radarr_instances')
      .insert({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
        status,
        is_primary: isPrimary,
        syncing,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .onConflict(['watchlist_id', 'radarr_instance_id'])
      .merge(['status', 'is_primary', 'syncing', 'updated_at'])

    this.log.debug(
      `Added watchlist ${watchlistId} to Radarr instance ${instanceId}`,
    )
  } catch (error) {
    this.log.error(
      `Error adding watchlist ${watchlistId} to Radarr instance ${instanceId}:`,
      error,
    )
    throw error
  }
}

/**
 * Updates the status of a watchlist item in a Radarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @param status - New status to set
 * @param lastNotifiedAt - Optional timestamp when item was last notified
 * @returns Promise resolving to void when complete
 */
export async function updateWatchlistRadarrInstanceStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified',
  lastNotifiedAt: string | null = null,
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: this.timestamp,
    }

    if (lastNotifiedAt !== undefined) {
      updateData.last_notified_at = lastNotifiedAt
    }

    await this.knex('watchlist_radarr_instances')
      .where({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
      })
      .update(updateData)

    this.log.debug(
      `Updated watchlist ${watchlistId} Radarr instance ${instanceId} status to ${status}`,
    )
  } catch (error) {
    this.log.error(
      `Error updating watchlist ${watchlistId} Radarr instance ${instanceId} status:`,
      error,
    )
    throw error
  }
}

/**
 * Removes a watchlist item from a Radarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @returns Promise resolving to void when complete
 */
export async function removeWatchlistFromRadarrInstance(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<void> {
  try {
    await this.knex('watchlist_radarr_instances')
      .where({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
      })
      .delete()

    this.log.debug(
      `Removed watchlist ${watchlistId} from Radarr instance ${instanceId}`,
    )
  } catch (error) {
    this.log.error(
      `Error removing watchlist ${watchlistId} from Radarr instance ${instanceId}:`,
      error,
    )
    throw error
  }
}

/**
 * Sets the primary Radarr instance for a watchlist item
 *
 * @param watchlistId - ID of the watchlist item
 * @param primaryInstanceId - ID of the Radarr instance to set as primary
 * @returns Promise resolving to void when complete
 */
export async function setPrimaryRadarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      await transactionQuery('watchlist_radarr_instances')
        .where({ watchlist_id: watchlistId })
        .update({
          is_primary: false,
          updated_at: this.timestamp,
        })

      await transactionQuery('watchlist_radarr_instances')
        .where({
          watchlist_id: watchlistId,
          radarr_instance_id: primaryInstanceId,
        })
        .update({
          is_primary: true,
          updated_at: this.timestamp,
        })
    }

    if (trx) {
      await executeInTransaction(trx)
    } else {
      await this.knex.transaction(executeInTransaction)
    }

    this.log.debug(
      `Set Radarr instance ${primaryInstanceId} as primary for watchlist ${watchlistId}`,
    )
  } catch (error) {
    this.log.error(
      `Error setting primary Radarr instance for watchlist ${watchlistId}:`,
      error,
    )
    throw error
  }
}

/**
 * Gets all Radarr instance junctions for given watchlist items
 *
 * @param watchlistIds - Array of watchlist item IDs
 * @returns Promise resolving to array of junction records
 */
export async function getAllWatchlistRadarrInstanceJunctions(
  this: DatabaseService,
  watchlistIds: number[],
): Promise<
  Array<{
    watchlist_id: number
    radarr_instance_id: number
    status: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary: boolean
    syncing: boolean
    last_notified_at: string | null
  }>
> {
  return this.knex('watchlist_radarr_instances')
    .whereIn('watchlist_id', watchlistIds)
    .select('*')
}

/**
 * Bulk adds watchlist items to Radarr instances
 *
 * @param junctions - Array of items to add with watchlist ID, instance ID, and optional status
 * @returns Promise resolving to void when complete
 */
export async function bulkAddWatchlistToRadarrInstances(
  this: DatabaseService,
  junctions: Array<{
    watchlist_id: number
    radarr_instance_id: number
    status: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary: boolean
    last_notified_at?: string
    syncing?: boolean
  }>,
): Promise<void> {
  const timestamp = this.timestamp

  const records = junctions.map((junction) => ({
    watchlist_id: junction.watchlist_id,
    radarr_instance_id: junction.radarr_instance_id,
    status: junction.status,
    is_primary: junction.is_primary,
    syncing: junction.syncing ?? false,
    last_notified_at: junction.last_notified_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  }))

  // Process in chunks within a transaction
  await this.knex.transaction(async (trx) => {
    const chunks = this.chunkArray(records, 100)

    for (const chunk of chunks) {
      // Instead of ignoring conflicts, merge the updates
      await trx('watchlist_radarr_instances')
        .insert(chunk)
        .onConflict(['watchlist_id', 'radarr_instance_id'])
        .merge([
          'status',
          'is_primary',
          'syncing',
          'last_notified_at',
          'updated_at',
        ])
    }
  })
}

/**
 * Bulk updates watchlist item statuses in Radarr instances
 *
 * @param updates - Array of status updates
 * @returns Promise resolving to void when complete
 */
export async function bulkUpdateWatchlistRadarrInstanceStatuses(
  this: DatabaseService,
  updates: Array<{
    watchlist_id: number
    radarr_instance_id: number
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary?: boolean
    last_notified_at?: string
  }>,
): Promise<void> {
  const timestamp = this.timestamp

  // Use transaction to ensure all updates are atomic
  await this.knex.transaction(async (trx) => {
    for (const update of updates) {
      if (
        update.status &&
        !['pending', 'requested', 'grabbed', 'notified'].includes(update.status)
      ) {
        throw new Error(`Invalid status '${update.status}'`)
      }

      const { watchlist_id, radarr_instance_id, ...fields } = update

      // Filter out undefined values to prevent setting fields to NULL
      const updateFields = Object.entries(fields).reduce(
        (acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, unknown>,
      )

      await trx('watchlist_radarr_instances')
        .where({
          watchlist_id,
          radarr_instance_id,
        })
        .update({
          ...updateFields,
          updated_at: timestamp,
        })
    }
  })
}

/**
 * Bulk removes watchlist items from Radarr instances
 *
 * @param removals - Array of items to remove with watchlist ID and instance ID
 * @returns Promise resolving to void when complete
 */
export async function bulkRemoveWatchlistFromRadarrInstances(
  this: DatabaseService,
  removals: Array<{
    watchlist_id: number
    radarr_instance_id: number
  }>,
): Promise<void> {
  // Use a single query with multiple OR conditions
  await this.knex.transaction(async (trx) => {
    // Process in reasonable chunks
    const chunks = this.chunkArray(removals, 50)

    for (const chunk of chunks) {
      await trx('watchlist_radarr_instances')
        .where(function () {
          for (const removal of chunk) {
            this.orWhere({
              watchlist_id: removal.watchlist_id,
              radarr_instance_id: removal.radarr_instance_id,
            })
          }
        })
        .delete()
    }
  })
}

/**
 * Retrieves all Sonarr instance IDs associated with a watchlist item
 *
 * This method queries the watchlist_sonarr_instances junction table to find
 * all Sonarr instances that a particular watchlist item is associated with.
 * This is essential for multi-instance deployments where content may be
 * distributed across several Sonarr instances.
 *
 * @param watchlistId - ID of the watchlist item
 * @returns Promise resolving to array of Sonarr instance IDs
 */
export async function getWatchlistSonarrInstanceIds(
  this: DatabaseService,
  watchlistId: number,
  trx?: Knex.Transaction,
): Promise<number[]> {
  try {
    const query = trx || this.knex
    const result = await query('watchlist_sonarr_instances')
      .select('sonarr_instance_id')
      .where({ watchlist_id: watchlistId })

    return result.map((r) => r.sonarr_instance_id)
  } catch (error) {
    this.log.error(
      `Error getting Sonarr instance IDs for watchlist ${watchlistId}:`,
      error,
    )
    return []
  }
}

/**
 * Retrieves the instance status for a watchlist item in Sonarr
 *
 * Queries the junction table to get detailed status information about how a specific
 * watchlist item is configured in a particular Sonarr instance.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @returns Promise resolving to the status information if found, null otherwise
 */
export async function getWatchlistSonarrInstanceStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<WatchlistInstanceStatus | null> {
  try {
    const result = await this.knex('watchlist_sonarr_instances')
      .select('status', 'last_notified_at', 'is_primary')
      .where({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
      })
      .first()

    return result || null
  } catch (error) {
    this.log.error(
      `Error getting Sonarr instance status for watchlist ${watchlistId}, instance ${instanceId}:`,
      error,
    )
    return null
  }
}

/**
 * Adds a watchlist item to a Sonarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @param status - Optional initial status
 * @param isPrimary - Whether this instance is primary for the item
 * @param syncing - Whether the item is currently syncing
 * @returns Promise resolving to void when complete
 */
export async function addWatchlistToSonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified' = 'pending',
  isPrimary = false,
  syncing = false,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const query = trx || this.knex
    await query('watchlist_sonarr_instances')
      .insert({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
        status,
        is_primary: isPrimary,
        syncing,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .onConflict(['watchlist_id', 'sonarr_instance_id'])
      .merge(['status', 'is_primary', 'syncing', 'updated_at'])

    this.log.debug(
      `Added watchlist ${watchlistId} to Sonarr instance ${instanceId}`,
    )
  } catch (error) {
    this.log.error(
      `Error adding watchlist ${watchlistId} to Sonarr instance ${instanceId}:`,
      error,
    )
    throw error
  }
}

/**
 * Updates the status of a watchlist item in a Sonarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @param status - New status to set
 * @param lastNotifiedAt - Optional timestamp when item was last notified
 * @returns Promise resolving to void when complete
 */
export async function updateWatchlistSonarrInstanceStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified',
  lastNotifiedAt: string | null = null,
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: this.timestamp,
    }

    if (lastNotifiedAt !== undefined) {
      updateData.last_notified_at = lastNotifiedAt
    }

    await this.knex('watchlist_sonarr_instances')
      .where({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
      })
      .update(updateData)

    this.log.debug(
      `Updated watchlist ${watchlistId} Sonarr instance ${instanceId} status to ${status}`,
    )
  } catch (error) {
    this.log.error(
      `Error updating watchlist ${watchlistId} Sonarr instance ${instanceId} status:`,
      error,
    )
    throw error
  }
}

/**
 * Removes a watchlist item from a Sonarr instance
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @returns Promise resolving to void when complete
 */
export async function removeWatchlistFromSonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<void> {
  try {
    await this.knex('watchlist_sonarr_instances')
      .where({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
      })
      .delete()

    this.log.debug(
      `Removed watchlist ${watchlistId} from Sonarr instance ${instanceId}`,
    )
  } catch (error) {
    this.log.error(
      `Error removing watchlist ${watchlistId} from Sonarr instance ${instanceId}:`,
      error,
    )
    throw error
  }
}

/**
 * Sets the primary Sonarr instance for a watchlist item
 *
 * @param watchlistId - ID of the watchlist item
 * @param primaryInstanceId - ID of the Sonarr instance to set as primary
 * @returns Promise resolving to void when complete
 */
export async function setPrimarySonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      await transactionQuery('watchlist_sonarr_instances')
        .where({ watchlist_id: watchlistId })
        .update({
          is_primary: false,
          updated_at: this.timestamp,
        })

      await transactionQuery('watchlist_sonarr_instances')
        .where({
          watchlist_id: watchlistId,
          sonarr_instance_id: primaryInstanceId,
        })
        .update({
          is_primary: true,
          updated_at: this.timestamp,
        })
    }

    if (trx) {
      await executeInTransaction(trx)
    } else {
      await this.knex.transaction(executeInTransaction)
    }

    this.log.debug(
      `Set Sonarr instance ${primaryInstanceId} as primary for watchlist ${watchlistId}`,
    )
  } catch (error) {
    this.log.error(
      `Error setting primary Sonarr instance for watchlist ${watchlistId}:`,
      error,
    )
    throw error
  }
}

/**
 * Gets all Sonarr instance junctions for given watchlist items
 *
 * @param watchlistIds - Array of watchlist item IDs
 * @returns Promise resolving to array of junction records
 */
export async function getAllWatchlistSonarrInstanceJunctions(
  this: DatabaseService,
  watchlistIds: number[],
): Promise<
  Array<{
    watchlist_id: number
    sonarr_instance_id: number
    status: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary: boolean
    last_notified_at: string | null
  }>
> {
  return this.knex('watchlist_sonarr_instances')
    .whereIn('watchlist_id', watchlistIds)
    .select('*')
}

/**
 * Bulk adds watchlist items to Sonarr instances
 *
 * @param junctions - Array of items to add with watchlist ID, instance ID, and optional status
 * @returns Promise resolving to void when complete
 */
export async function bulkAddWatchlistToSonarrInstances(
  this: DatabaseService,
  junctions: Array<{
    watchlist_id: number
    sonarr_instance_id: number
    status: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary: boolean
    last_notified_at?: string
    syncing?: boolean
  }>,
): Promise<void> {
  const timestamp = this.timestamp

  const records = junctions.map((junction) => ({
    watchlist_id: junction.watchlist_id,
    sonarr_instance_id: junction.sonarr_instance_id,
    status: junction.status,
    is_primary: junction.is_primary,
    syncing: junction.syncing ?? false,
    last_notified_at: junction.last_notified_at || null,
    created_at: timestamp,
    updated_at: timestamp,
  }))

  // Process in chunks within a transaction
  await this.knex.transaction(async (trx) => {
    const chunks = this.chunkArray(records, 100)

    for (const chunk of chunks) {
      // Instead of ignoring conflicts, merge the updates
      await trx('watchlist_sonarr_instances')
        .insert(chunk)
        .onConflict(['watchlist_id', 'sonarr_instance_id'])
        .merge([
          'status',
          'is_primary',
          'syncing',
          'last_notified_at',
          'updated_at',
        ])
    }
  })
}

/**
 * Bulk updates watchlist item statuses in Sonarr instances
 *
 * @param updates - Array of status updates
 * @returns Promise resolving to void when complete
 */
export async function bulkUpdateWatchlistSonarrInstanceStatuses(
  this: DatabaseService,
  updates: Array<{
    watchlist_id: number
    sonarr_instance_id: number
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary?: boolean
    last_notified_at?: string
  }>,
): Promise<void> {
  const timestamp = this.timestamp

  // Use transaction to ensure all updates are atomic
  await this.knex.transaction(async (trx) => {
    for (const update of updates) {
      const { watchlist_id, sonarr_instance_id, ...fields } = update

      // Validate status field if provided
      if (
        fields.status &&
        !['pending', 'requested', 'grabbed', 'notified'].includes(fields.status)
      ) {
        throw new Error(`Invalid status '${fields.status}'`)
      }

      // Filter out undefined values to prevent setting fields to NULL
      const updateFields = Object.entries(fields).reduce(
        (acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, unknown>,
      )

      await trx('watchlist_sonarr_instances')
        .where({
          watchlist_id,
          sonarr_instance_id,
        })
        .update({
          ...updateFields,
          updated_at: timestamp,
        })
    }
  })
}

/**
 * Bulk removes watchlist items from Sonarr instances
 *
 * @param removals - Array of items to remove with watchlist ID and instance ID
 * @returns Promise resolving to void when complete
 */
export async function bulkRemoveWatchlistFromSonarrInstances(
  this: DatabaseService,
  removals: Array<{
    watchlist_id: number
    sonarr_instance_id: number
  }>,
): Promise<void> {
  // Use a single query with multiple OR conditions
  await this.knex.transaction(async (trx) => {
    // Process in reasonable chunks
    const chunks = this.chunkArray(removals, 50)

    for (const chunk of chunks) {
      await trx('watchlist_sonarr_instances')
        .where(function () {
          for (const removal of chunk) {
            this.orWhere({
              watchlist_id: removal.watchlist_id,
              sonarr_instance_id: removal.sonarr_instance_id,
            })
          }
        })
        .delete()
    }
  })
}

/**
 * Retrieves detailed content distribution statistics across all instances
 *
 * This comprehensive method builds a complete breakdown of how content is distributed
 * across all Sonarr and Radarr instances. For each instance, it provides:
 * - Total number of items
 * - Number of items where this instance is the primary
 * - Distribution of items by status (pending, requested, etc.)
 * - Distribution of items by content type (movies, shows, etc.)
 *
 * The information is valuable for administrators to understand content allocation
 * and load distribution across instances.
 *
 * @returns Promise resolving to object with instance content breakdown statistics
 */
export async function getInstanceContentBreakdown(
  this: DatabaseService,
): Promise<{
  success: boolean
  instances: Array<{
    id: number
    name: string
    type: 'sonarr' | 'radarr'
    total_items: number
    by_status: Array<{ status: string; count: number }>
    by_content_type: Array<{ content_type: string; count: number }>
    primary_items: number
  }>
}> {
  try {
    // Get all Radarr instances
    const radarrInstances = await this.knex('radarr_instances')
      .select('id', 'name')
      .where('is_enabled', true)

    // Get all Sonarr instances
    const sonarrInstances = await this.knex('sonarr_instances')
      .select('id', 'name')
      .where('is_enabled', true)

    const instances = []

    // Process Radarr instances
    for (const instance of radarrInstances) {
      // Get total count
      const totalCount = await this.knex('watchlist_radarr_instances')
        .where('radarr_instance_id', instance.id)
        .count('* as count')
        .first()

      // Get count of primary items
      const primaryCount = await this.knex('watchlist_radarr_instances')
        .where({
          radarr_instance_id: instance.id,
          is_primary: true,
        })
        .count('* as count')
        .first()

      // Get breakdown by status
      const statusBreakdown = await this.knex('watchlist_radarr_instances')
        .select('status')
        .count('* as count')
        .where('radarr_instance_id', instance.id)
        .groupBy('status')

      // Get breakdown by content type (join with watchlist_items)
      const contentTypeBreakdown = await this.knex('watchlist_radarr_instances')
        .join(
          'watchlist_items',
          'watchlist_items.id',
          'watchlist_radarr_instances.watchlist_id',
        )
        .select('watchlist_items.type as content_type')
        .count('* as count')
        .where('watchlist_radarr_instances.radarr_instance_id', instance.id)
        .groupBy('watchlist_items.type')

      instances.push({
        id: instance.id,
        name: instance.name,
        type: 'radarr' as const,
        total_items: Number(totalCount?.count || 0),
        primary_items: Number(primaryCount?.count || 0),
        by_status: statusBreakdown.map((item) => ({
          status: String(item.status),
          count: Number(item.count),
        })),
        by_content_type: contentTypeBreakdown.map((item) => ({
          content_type: String(item.content_type),
          count: Number(item.count),
        })),
      })
    }

    // Process Sonarr instances
    for (const instance of sonarrInstances) {
      // Get total count
      const totalCount = await this.knex('watchlist_sonarr_instances')
        .where('sonarr_instance_id', instance.id)
        .count('* as count')
        .first()

      // Get count of primary items
      const primaryCount = await this.knex('watchlist_sonarr_instances')
        .where({
          sonarr_instance_id: instance.id,
          is_primary: true,
        })
        .count('* as count')
        .first()

      // Get breakdown by status
      const statusBreakdown = await this.knex('watchlist_sonarr_instances')
        .select('status')
        .count('* as count')
        .where('sonarr_instance_id', instance.id)
        .groupBy('status')

      // Get breakdown by content type (join with watchlist_items)
      const contentTypeBreakdown = await this.knex('watchlist_sonarr_instances')
        .join(
          'watchlist_items',
          'watchlist_items.id',
          'watchlist_sonarr_instances.watchlist_id',
        )
        .select('watchlist_items.type as content_type')
        .count('* as count')
        .where('watchlist_sonarr_instances.sonarr_instance_id', instance.id)
        .groupBy('watchlist_items.type')

      instances.push({
        id: instance.id,
        name: instance.name,
        type: 'sonarr' as const,
        total_items: Number(totalCount?.count || 0),
        primary_items: Number(primaryCount?.count || 0),
        by_status: statusBreakdown.map((item) => ({
          status: String(item.status),
          count: Number(item.count),
        })),
        by_content_type: contentTypeBreakdown.map((item) => ({
          content_type: String(item.content_type),
          count: Number(item.count),
        })),
      })
    }

    return {
      success: true,
      instances,
    }
  } catch (error) {
    this.log.error('Error getting instance content breakdown:', error)
    throw error
  }
}

/**
 * Updates the syncing status of a watchlist item in Radarr
 *
 * Sets whether the item is currently being synchronized with the Radarr instance,
 * which helps prevent duplicate operations during content updates.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @param syncing - Boolean indicating whether the item is being synced
 * @returns Promise resolving to void when complete
 */
export async function updateRadarrSyncingStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  syncing: boolean,
  trx?: Knex.Transaction,
): Promise<void> {
  const query = trx || this.knex
  await query('watchlist_radarr_instances')
    .where({
      watchlist_id: watchlistId,
      radarr_instance_id: instanceId,
    })
    .update({
      syncing,
      updated_at: this.timestamp,
    })
}

/**
 * Updates the syncing status of a watchlist item in Sonarr
 *
 * Sets whether the item is currently being synchronized with the Sonarr instance,
 * which helps prevent duplicate operations during content updates.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @param syncing - Boolean indicating whether the item is being synced
 * @returns Promise resolving to void when complete
 */
export async function updateSonarrSyncingStatus(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  syncing: boolean,
  trx?: Knex.Transaction,
): Promise<void> {
  const query = trx || this.knex
  await query('watchlist_sonarr_instances')
    .where({
      watchlist_id: watchlistId,
      sonarr_instance_id: instanceId,
    })
    .update({
      syncing,
      updated_at: this.timestamp,
    })
}

/**
 * Checks if a watchlist item is currently syncing with a Radarr instance
 *
 * Determines whether a synchronization operation is in progress for this item,
 * which can be used to prevent concurrent operations that might conflict.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Radarr instance
 * @returns Promise resolving to true if the item is currently syncing, false otherwise
 */
export async function isRadarrItemSyncing(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<boolean> {
  const item = await this.knex('watchlist_radarr_instances')
    .where({
      watchlist_id: watchlistId,
      radarr_instance_id: instanceId,
    })
    .first()

  return item ? Boolean(item.syncing) : false
}

/**
 * Checks if a watchlist item is currently syncing with a Sonarr instance
 *
 * Determines whether a synchronization operation is in progress for this item,
 * which can be used to prevent concurrent operations that might conflict.
 *
 * @param watchlistId - ID of the watchlist item
 * @param instanceId - ID of the Sonarr instance
 * @returns Promise resolving to true if the item is currently syncing, false otherwise
 */
export async function isSonarrItemSyncing(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
): Promise<boolean> {
  const item = await this.knex('watchlist_sonarr_instances')
    .where({
      watchlist_id: watchlistId,
      sonarr_instance_id: instanceId,
    })
    .first()

  return item ? Boolean(item.syncing) : false
}
