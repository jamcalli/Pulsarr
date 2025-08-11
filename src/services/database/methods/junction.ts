import type { DatabaseService } from '@services/database.service.js'
import type { WatchlistInstanceStatus } from '@root/types/watchlist-status.types.js'
import type { Knex } from 'knex'

/**
 * Retrieves all Radarr instance IDs linked to a specific watchlist item.
 *
 * Returns an array of Radarr instance IDs associated with the given watchlist item. If an error occurs, returns an empty array.
 *
 * @param watchlistId - The ID of the watchlist item to query
 * @returns An array of Radarr instance IDs associated with the watchlist item
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
      { error, watchlistId },
      'Error getting Radarr instance IDs for watchlist',
    )
    return []
  }
}

/**
 * Retrieves the status details for a watchlist item on a specific Radarr instance.
 *
 * Returns the status, last notified timestamp, and primary flag for the given watchlist item and Radarr instance, or null if not found or on error.
 *
 * @param watchlistId - The ID of the watchlist item.
 * @param instanceId - The ID of the Radarr instance.
 * @returns The status information for the watchlist item on the specified Radarr instance, or null if not found.
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
      { error, watchlistId, instanceId },
      'Error getting Radarr instance status for watchlist',
    )
    return null
  }
}

/**
 * Associates a watchlist item with a Radarr instance, creating or updating the junction record with status, primary flag, and syncing state.
 *
 * If the association already exists, updates the status, primary flag, syncing flag, and timestamp.
 *
 * @param watchlistId - The ID of the watchlist item to associate
 * @param instanceId - The ID of the Radarr instance
 * @param status - The initial status for the association (defaults to 'pending')
 * @param isPrimary - Whether this instance is set as primary for the item (defaults to false)
 * @param syncing - Whether the item is currently syncing with the instance (defaults to false)
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
      { error, watchlistId, instanceId },
      'Error adding watchlist to Radarr instance',
    )
    throw error
  }
}

/**
 * Updates the status and optionally the last notified timestamp for a watchlist item on a specific Radarr instance.
 *
 * @param watchlistId - The ID of the watchlist item
 * @param instanceId - The ID of the Radarr instance
 * @param status - The new status to assign
 * @param lastNotifiedAt - Optional timestamp indicating when the item was last notified
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
      { error, watchlistId, instanceId },
      'Error updating watchlist Radarr instance status',
    )
    throw error
  }
}

/**
 * Deletes the association between a watchlist item and a Radarr instance.
 *
 * Removes the junction record linking the specified watchlist item to the given Radarr instance.
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
      { error, watchlistId, instanceId },
      'Error removing watchlist from Radarr instance',
    )
    throw error
  }
}

/**
 * Atomically sets the specified Radarr instance as the primary for a given watchlist item.
 *
 * Ensures only one Radarr instance is marked as primary for the watchlist item by updating all related records in a single transaction.
 */
export async function setPrimaryRadarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      // Atomic update using CASE WHEN to prevent race conditions
      await transactionQuery('watchlist_radarr_instances')
        .where({ watchlist_id: watchlistId })
        .update({
          is_primary: transactionQuery.raw(
            'CASE WHEN radarr_instance_id = ? THEN true ELSE false END',
            [primaryInstanceId],
          ),
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
      { error, watchlistId },
      'Error setting primary Radarr instance for watchlist',
    )
    throw error
  }
}

/**
 * Retrieves all Radarr instance junction records for the specified watchlist item IDs.
 *
 * @param watchlistIds - The IDs of the watchlist items to query.
 * @returns An array of junction records containing Radarr instance associations and their statuses for each watchlist item.
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
 * Bulk inserts or updates multiple watchlist-to-Radarr-instance associations.
 *
 * For each provided junction, creates or updates the record with the specified status, primary flag, syncing flag, and last notified timestamp. Existing records are merged on conflict.
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
 * Bulk updates the status and related fields for multiple watchlist items associated with Radarr instances.
 *
 * Each update can modify the status, primary flag, and last notified timestamp for a specific watchlist-to-Radarr-instance association. All updates are performed atomically within a transaction. Throws an error if an invalid status value is provided.
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
 * Removes multiple watchlist-to-Radarr-instance associations in bulk.
 *
 * Processes the removals in chunks for efficiency and deletes each specified junction record from the database.
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
 * Retrieves all Sonarr instance IDs linked to a specific watchlist item.
 *
 * Returns an array of Sonarr instance IDs associated with the given watchlist item. If an error occurs, an empty array is returned.
 *
 * @param watchlistId - The ID of the watchlist item to query.
 * @returns A promise that resolves to an array of Sonarr instance IDs.
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
      { error, watchlistId },
      'Error getting Sonarr instance IDs for watchlist',
    )
    return []
  }
}

/**
 * Retrieves the status details for a watchlist item on a specific Sonarr instance.
 *
 * Returns the status, last notified timestamp, and primary flag for the given watchlist item and Sonarr instance, or null if not found or on error.
 *
 * @param watchlistId - The ID of the watchlist item.
 * @param instanceId - The ID of the Sonarr instance.
 * @returns The status information for the watchlist item on the specified Sonarr instance, or null if not found.
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
      { error, watchlistId, instanceId },
      'Error getting Sonarr instance status for watchlist',
    )
    return null
  }
}

/**
 * Associates a watchlist item with a Sonarr instance, creating or updating the junction record with status, primary flag, and syncing state.
 *
 * If the association already exists, the status, primary flag, syncing flag, and updated timestamp are merged.
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
      { error, watchlistId, instanceId },
      'Error adding watchlist to Sonarr instance',
    )
    throw error
  }
}

/**
 * Updates the status and optionally the last notified timestamp for a watchlist item on a specific Sonarr instance.
 *
 * @param watchlistId - The ID of the watchlist item.
 * @param instanceId - The ID of the Sonarr instance.
 * @param status - The new status to assign to the watchlist item.
 * @param lastNotifiedAt - Optional timestamp indicating when the item was last notified.
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
      { error, watchlistId, instanceId },
      'Error updating watchlist Sonarr instance status',
    )
    throw error
  }
}

/**
 * Deletes the association between a watchlist item and a Sonarr instance.
 *
 * Removes the junction record linking the specified watchlist item to the given Sonarr instance.
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
      { error, watchlistId, instanceId },
      'Error removing watchlist from Sonarr instance',
    )
    throw error
  }
}

/**
 * Sets the specified Sonarr instance as the primary for a given watchlist item, ensuring only one primary per item.
 *
 * If a transaction is provided, the update occurs within that transaction; otherwise, a new transaction is used.
 */
export async function setPrimarySonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      // Atomic update using CASE WHEN to prevent race conditions
      await transactionQuery('watchlist_sonarr_instances')
        .where({ watchlist_id: watchlistId })
        .update({
          is_primary: transactionQuery.raw(
            'CASE WHEN sonarr_instance_id = ? THEN true ELSE false END',
            [primaryInstanceId],
          ),
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
      { error, watchlistId },
      'Error setting primary Sonarr instance for watchlist',
    )
    throw error
  }
}

/**
 * Retrieves all Sonarr instance junction records for the specified watchlist item IDs.
 *
 * @param watchlistIds - The IDs of the watchlist items to query.
 * @returns An array of junction records containing Sonarr instance associations and status details for each watchlist item.
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
 * Bulk inserts or updates multiple watchlist-to-Sonarr-instance associations.
 *
 * Each entry in the input array specifies a watchlist item, Sonarr instance, status, primary flag, and optional syncing and notification timestamp. Existing records are updated on conflict.
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
 * Bulk updates the status and related fields for multiple watchlist items associated with Sonarr instances.
 *
 * Each update can modify the status, primary flag, and last notified timestamp for a specific watchlist-to-Sonarr-instance association. All updates are performed atomically within a transaction. Throws an error if an invalid status is provided.
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
 * Bulk removes associations between watchlist items and Sonarr instances.
 *
 * Removes multiple records from the `watchlist_sonarr_instances` junction table based on the provided watchlist and instance ID pairs.
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
 * Retrieves content distribution statistics for all enabled Radarr and Sonarr instances.
 *
 * For each instance, returns the total number of associated watchlist items, the number of items where the instance is primary, and breakdowns by status and content type.
 *
 * @returns Promise resolving to an object containing a success flag and an array of instance content breakdowns
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
    this.log.error({ error }, 'Error getting instance content breakdown:')
    throw error
  }
}

/**
 * Updates the syncing flag for a watchlist item on a Radarr instance.
 *
 * Marks whether the specified watchlist item is currently being synchronized with the given Radarr instance to coordinate concurrent operations.
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
 * Updates the syncing flag for a watchlist item on a Sonarr instance.
 *
 * Marks whether the specified watchlist item is currently being synchronized with the given Sonarr instance.
 *
 * @param watchlistId - The ID of the watchlist item.
 * @param instanceId - The ID of the Sonarr instance.
 * @param syncing - True if the item is currently syncing; false otherwise.
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
 * Returns whether a watchlist item is currently syncing with a Radarr instance.
 *
 * @param watchlistId - The ID of the watchlist item.
 * @param instanceId - The ID of the Radarr instance.
 * @returns True if the item is syncing with the instance; otherwise, false.
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
 * Returns whether a watchlist item is currently syncing with a Sonarr instance.
 *
 * @returns Promise resolving to true if the item is syncing, or false if not syncing or not found.
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
