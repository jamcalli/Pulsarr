import type { User } from '@root/types/config.types.js'
import type { SonarrShowWithEnrollmentStatus } from '@root/types/watchlist-status.types.js'
import { orderAsText } from '@services/database/ordering.js'
import { mapRowToUser } from '@services/database/user-rows.js'
import type { DatabaseService } from '@services/database.service.js'
import { chunkArray } from '@utils/chunk-array.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { Knex } from 'knex'

/** Returns [] on error */
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

/** Upserts, overwriting status, primary and syncing on an existing row */
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

export async function setPrimaryRadarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      // One CASE WHEN update keeps exactly one primary without a read-then-write race
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

/** Upserts, overwriting status, primary, syncing and last_notified_at on existing rows */
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

  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(records, 100)

    for (const chunk of chunks) {
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

/** Throws on an invalid status, and undefined fields are left unchanged */
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

  await this.knex.transaction(async (trx) => {
    for (const update of updates) {
      if (
        update.status &&
        !['pending', 'requested', 'grabbed', 'notified'].includes(update.status)
      ) {
        throw new Error(`Invalid status '${update.status}'`)
      }

      const { watchlist_id, radarr_instance_id, ...fields } = update

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

export async function bulkRemoveWatchlistFromRadarrInstances(
  this: DatabaseService,
  removals: Array<{
    watchlist_id: number
    radarr_instance_id: number
  }>,
): Promise<void> {
  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(removals, 50)

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

/** Returns [] on error */
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

/** Upserts, overwriting status, primary, syncing and a given sonarrSeriesId on an existing row */
export async function addWatchlistToSonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  instanceId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified' = 'pending',
  isPrimary = false,
  syncing = false,
  trx?: Knex.Transaction,
  sonarrSeriesId?: number,
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
        ...(sonarrSeriesId !== undefined && {
          sonarr_series_id: sonarrSeriesId,
        }),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .onConflict(['watchlist_id', 'sonarr_instance_id'])
      .merge({
        status,
        is_primary: isPrimary,
        syncing,
        ...(sonarrSeriesId !== undefined && {
          sonarr_series_id: sonarrSeriesId,
        }),
        updated_at: this.timestamp,
      })

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

export async function setPrimarySonarrInstance(
  this: DatabaseService,
  watchlistId: number,
  primaryInstanceId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const executeInTransaction = async (transactionQuery: Knex.Transaction) => {
      // One CASE WHEN update keeps exactly one primary without a read-then-write race
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
    sonarr_series_id: number | null
  }>
> {
  return this.knex('watchlist_sonarr_instances')
    .whereIn('watchlist_id', watchlistIds)
    .select('*')
}

/** Upserts, overwriting status, primary, syncing and last_notified_at on existing rows */
export async function bulkAddWatchlistToSonarrInstances(
  this: DatabaseService,
  junctions: Array<{
    watchlist_id: number
    sonarr_instance_id: number
    status: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary: boolean
    last_notified_at?: string
    syncing?: boolean
    sonarr_series_id?: number
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
    sonarr_series_id: junction.sonarr_series_id ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }))

  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(records, 100)

    for (const chunk of chunks) {
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

/** Throws on an invalid status, and undefined fields are left unchanged */
export async function bulkUpdateWatchlistSonarrInstanceStatuses(
  this: DatabaseService,
  updates: Array<{
    watchlist_id: number
    sonarr_instance_id: number
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    is_primary?: boolean
    last_notified_at?: string
    sonarr_series_id?: number
  }>,
): Promise<void> {
  const timestamp = this.timestamp

  await this.knex.transaction(async (trx) => {
    for (const update of updates) {
      const { watchlist_id, sonarr_instance_id, ...fields } = update

      if (
        fields.status &&
        !['pending', 'requested', 'grabbed', 'notified'].includes(fields.status)
      ) {
        throw new Error(`Invalid status '${fields.status}'`)
      }

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

export async function bulkRemoveWatchlistFromSonarrInstances(
  this: DatabaseService,
  removals: Array<{
    watchlist_id: number
    sonarr_instance_id: number
  }>,
): Promise<void> {
  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(removals, 50)

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

/** Covers enabled instances only, and days > 0 counts only junction rows created in that window */
export async function getInstanceContentBreakdown(
  this: DatabaseService,
  options: { days?: number } = {},
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
  const { days = 0 } = options
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  // SQLite stores ISO text and knex binds a Date as epoch ms, which never compares against text
  const cutoffISO = cutoffDate.toISOString()
  const routedInRange =
    (table: 'watchlist_radarr_instances' | 'watchlist_sonarr_instances') =>
    (query: Knex.QueryBuilder) => {
      if (days > 0) {
        query.where(`${table}.created_at`, '>=', cutoffISO)
      }
    }

  try {
    const radarrInstances = await this.knex('radarr_instances')
      .select('id', 'name')
      .where('is_enabled', true)

    const sonarrInstances = await this.knex('sonarr_instances')
      .select('id', 'name')
      .where('is_enabled', true)

    const instances = []

    for (const instance of radarrInstances) {
      const totalCount = await this.knex('watchlist_radarr_instances')
        .where(routedInRange('watchlist_radarr_instances'))
        .where('radarr_instance_id', instance.id)
        .count('* as count')
        .first()

      const primaryCount = await this.knex('watchlist_radarr_instances')
        .where(routedInRange('watchlist_radarr_instances'))
        .where({
          radarr_instance_id: instance.id,
          is_primary: true,
        })
        .count('* as count')
        .first()

      const statusBreakdown = await orderAsText(
        this.knex('watchlist_radarr_instances')
          .where(routedInRange('watchlist_radarr_instances'))
          .select('status')
          .count('* as count')
          .where('radarr_instance_id', instance.id)
          .groupBy('status'),
        'status',
      )

      const contentTypeBreakdown = await this.knex('watchlist_radarr_instances')
        .where(routedInRange('watchlist_radarr_instances'))
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

    for (const instance of sonarrInstances) {
      const totalCount = await this.knex('watchlist_sonarr_instances')
        .where(routedInRange('watchlist_sonarr_instances'))
        .where('sonarr_instance_id', instance.id)
        .count('* as count')
        .first()

      const primaryCount = await this.knex('watchlist_sonarr_instances')
        .where(routedInRange('watchlist_sonarr_instances'))
        .where({
          sonarr_instance_id: instance.id,
          is_primary: true,
        })
        .count('* as count')
        .first()

      const statusBreakdown = await orderAsText(
        this.knex('watchlist_sonarr_instances')
          .where(routedInRange('watchlist_sonarr_instances'))
          .select('status')
          .count('* as count')
          .where('sonarr_instance_id', instance.id)
          .groupBy('status'),
        'status',
      )

      const contentTypeBreakdown = await this.knex('watchlist_sonarr_instances')
        .where(routedInRange('watchlist_sonarr_instances'))
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

/** Returns can_sync users with items on this instance, so tags are never created for empty watchlists */
export async function getUsersWithRadarrItems(
  this: DatabaseService,
  instanceId: number,
): Promise<User[]> {
  try {
    const rows = await this.knex('users as u')
      .join('watchlist_items as wi', 'wi.user_id', 'u.id')
      .join('watchlist_radarr_instances as wri', 'wi.id', 'wri.watchlist_id')
      .where('wri.radarr_instance_id', instanceId)
      .andWhere('u.id', '>', 0) // Exclude system user (id=0)
      .andWhere('u.can_sync', true)
      .distinct('u.*')

    return rows.map((row) => mapRowToUser(row))
  } catch (error) {
    this.log.error(
      { error, instanceId },
      'Error getting users with Radarr items',
    )
    return []
  }
}

/** Returns can_sync users with items on this instance, so tags are never created for empty watchlists */
export async function getUsersWithSonarrItems(
  this: DatabaseService,
  instanceId: number,
): Promise<User[]> {
  try {
    const rows = await this.knex('users as u')
      .join('watchlist_items as wi', 'wi.user_id', 'u.id')
      .join('watchlist_sonarr_instances as wsi', 'wi.id', 'wsi.watchlist_id')
      .where('wsi.sonarr_instance_id', instanceId)
      .andWhere('u.id', '>', 0) // Exclude system user (id=0)
      .andWhere('u.can_sync', true)
      .distinct('u.*')

    return rows.map((row) => mapRowToUser(row))
  } catch (error) {
    this.log.error(
      { error, instanceId },
      'Error getting users with Sonarr items',
    )
    return []
  }
}

/** Returns one row per tracked series and instance, with rolling fields from the master record or null, and [] on error */
export async function getSonarrShowsWithEnrollmentStatus(
  this: DatabaseService,
  instanceId?: number,
): Promise<SonarrShowWithEnrollmentStatus[]> {
  try {
    let query = this.knex('watchlist_sonarr_instances as wsi')
      .join('watchlist_items as wi', 'wi.id', 'wsi.watchlist_id')
      .leftJoin('rolling_monitored_shows as rms', function () {
        this.on('rms.sonarr_series_id', 'wsi.sonarr_series_id')
          .andOn('rms.sonarr_instance_id', 'wsi.sonarr_instance_id')
          .andOnNull('rms.plex_user_id')
      })
      .whereNotNull('wsi.sonarr_series_id')
      .andWhere('wi.type', 'show')
      // Several users can watchlist one show, so group to one row per series and instance
      .groupBy('wsi.sonarr_instance_id', 'wsi.sonarr_series_id')
      .min({
        watchlist_id: 'wsi.watchlist_id',
        sonarr_instance_id: 'wsi.sonarr_instance_id',
        sonarr_series_id: 'wsi.sonarr_series_id',
        title: 'wi.title',
        // jsonb doesn't support min() in Postgres
        guids: this.isPostgres
          ? this.knex.raw('"wi"."guids"::text')
          : 'wi.guids',
        rolling_show_id: 'rms.id',
        monitoring_type: 'rms.monitoring_type',
      })

    if (instanceId) {
      query = query.andWhere('wsi.sonarr_instance_id', instanceId)
    }

    const rows = await query

    return rows.map((row) => ({
      watchlist_id: row.watchlist_id,
      sonarr_instance_id: row.sonarr_instance_id,
      sonarr_series_id: row.sonarr_series_id,
      title: row.title,
      guids: parseGuids(row.guids),
      rolling_show_id: row.rolling_show_id ?? null,
      monitoring_type: row.monitoring_type ?? null,
    }))
  } catch (error) {
    this.log.error(
      { error, instanceId },
      'Error getting Sonarr shows with enrollment status',
    )
    return []
  }
}
