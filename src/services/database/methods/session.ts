import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Creates a new rolling monitored show record with initial progress and timestamps.
 *
 * @param data - Object containing show identifiers, title, monitoring type, monitored season, and optional user information.
 * @returns Promise resolving to the ID of the newly created record.
 */
export async function createRollingMonitoredShow(
  this: DatabaseService,
  data: {
    sonarr_series_id: number
    sonarr_instance_id: number
    tvdb_id?: string
    imdb_id?: string
    show_title: string
    monitoring_type: 'pilotRolling' | 'firstSeasonRolling'
    current_monitored_season: number
    plex_user_id?: string
    plex_username?: string
  },
): Promise<number> {
  try {
    const result = await this.knex('rolling_monitored_shows')
      .insert({
        ...data,
        last_watched_season: 0,
        last_watched_episode: 0,
        last_session_date: this.timestamp,
        created_at: this.timestamp,
        updated_at: this.timestamp,
        last_updated_at: this.timestamp,
      })
      .returning('id')

    const id = this.extractId(result)

    this.log.info(
      `Created rolling monitored show: ${data.show_title} (ID: ${id})`,
    )
    return id
  } catch (error) {
    this.log.error({ error }, 'Error creating rolling monitored show:')
    throw new Error('Failed to create rolling monitored show')
  }
}

/**
 * Creates or finds an existing per-user rolling monitored show entry.
 * Handles race conditions safely using database-level unique constraint.
 * Requires a unique database constraint on (sonarr_series_id, sonarr_instance_id, plex_user_id).
 *
 * @param globalShow - The master/global rolling show configuration to base the per-user entry on
 * New per-user entries always start with current_monitored_season = 1.
 * @param plexUserId - The Plex user ID
 * @param plexUsername - The Plex username
 * @returns The ID of the created or existing per-user entry
 */
export async function createOrFindUserRollingMonitoredShow(
  this: DatabaseService,
  globalShow: RollingMonitoredShow,
  plexUserId: string,
  plexUsername: string,
): Promise<number> {
  const now = this.timestamp
  const values = {
    sonarr_series_id: globalShow.sonarr_series_id,
    sonarr_instance_id: globalShow.sonarr_instance_id,
    tvdb_id: globalShow.tvdb_id,
    imdb_id: globalShow.imdb_id,
    show_title: globalShow.show_title,
    monitoring_type: globalShow.monitoring_type,
    current_monitored_season: 1, // New users always start from season 1
    plex_user_id: plexUserId,
    plex_username: plexUsername,
    last_watched_season: 0,
    last_watched_episode: 0,
    last_session_date: now,
    created_at: now,
    updated_at: now,
    last_updated_at: now,
  }

  try {
    if (this.isPostgres) {
      // PostgreSQL: Use DO UPDATE to return existing ID and update last_updated_at
      const result = await this.knex('rolling_monitored_shows')
        .insert(values)
        .onConflict(['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'])
        .merge({
          last_updated_at: now,
          updated_at: now,
        })
        .returning('id')

      // If we got an ID back, return it
      if (result && result.length > 0) {
        const id = this.extractId(result)
        this.log.info(
          `Created/updated per-user rolling show entry for ${globalShow.show_title} for user ${plexUsername} (ID: ${id})`,
        )
        return id
      }
    } else {
      // SQLite: Use DO NOTHING and fall back to select
      const result = await this.knex('rolling_monitored_shows')
        .insert(values)
        .onConflict(['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'])
        .ignore()
        .returning('id')

      // If we got an ID back, return it
      if (result && result.length > 0) {
        const id = this.extractId(result)
        this.log.info(
          `Created/updated per-user rolling show entry for ${globalShow.show_title} for user ${plexUsername} (ID: ${id})`,
        )
        return id
      }
    }
  } catch (error) {
    // Only swallow expected unique/constraint conflicts; rethrow others
    const errorObj = error as Record<string, unknown>
    const msg = String(errorObj?.message || '')
    const code = (errorObj && (errorObj.code || errorObj.errno)) || ''
    const isConflict =
      code === '23505' || // Postgres unique violation
      msg.includes('SQLITE_CONSTRAINT') || // SQLite unique
      msg.includes('UNIQUE constraint failed') // SQLite unique
    if (!isConflict) {
      this.log.error({ error }, 'Unexpected error inserting per-user entry')
      throw error
    }
    this.log.debug(
      { error },
      `Insert conflict for per-user entry (${globalShow.show_title}, user: ${plexUsername}), looking up existing entry`,
    )
  }

  // Insert was ignored due to conflict or we caught a unique violation - find the existing entry
  const existingEntry = await this.knex('rolling_monitored_shows')
    .where({
      sonarr_series_id: globalShow.sonarr_series_id,
      sonarr_instance_id: globalShow.sonarr_instance_id,
      plex_user_id: plexUserId,
    })
    .first()

  if (existingEntry) {
    this.log.debug(
      `Using existing per-user rolling show entry for ${globalShow.show_title} for user ${plexUsername} (ID: ${existingEntry.id})`,
    )
    return existingEntry.id
  }

  throw new Error(
    `Failed to create or find per-user rolling show entry for ${globalShow.show_title} (user: ${plexUsername})`,
  )
}

/**
 * Retrieves all rolling monitored shows ordered by show title.
 *
 * @returns An array of rolling monitored show records, or an empty array if an error occurs.
 */
export async function getRollingMonitoredShows(
  this: DatabaseService,
): Promise<RollingMonitoredShow[]> {
  try {
    return await this.knex('rolling_monitored_shows').orderBy(
      'show_title',
      'asc',
    )
  } catch (error) {
    this.log.error({ error }, 'Error getting rolling monitored shows:')
    return []
  }
}

/**
 * Retrieves a rolling monitored show record by its unique ID.
 *
 * @param id - The unique identifier of the rolling monitored show
 * @returns The matching rolling monitored show record, or null if not found or on error
 */
export async function getRollingMonitoredShowById(
  this: DatabaseService,
  id: number,
): Promise<RollingMonitoredShow | null> {
  try {
    const result = await this.knex('rolling_monitored_shows')
      .where('id', id)
      .first()

    return result || null
  } catch (error) {
    this.log.error({ error }, 'Error getting rolling monitored show by ID:')
    return null
  }
}

/**
 * Retrieves a rolling monitored show by TVDB ID or show title, optionally filtered by Plex user ID.
 *
 * If a Plex user ID is provided, returns the per-user entry; otherwise, returns the global (legacy) entry.
 *
 * @param tvdbId - The TVDB ID of the show (optional)
 * @param title - The title of the show (optional)
 * @param plexUserId - The Plex user ID for per-user tracking (optional)
 * @returns The matching rolling monitored show, or null if not found or on error
 */
export async function getRollingMonitoredShow(
  this: DatabaseService,
  tvdbId?: string,
  title?: string,
  plexUserId?: string,
): Promise<RollingMonitoredShow | null> {
  try {
    const query = this.knex('rolling_monitored_shows')

    if (tvdbId) {
      query.where('tvdb_id', tvdbId)
    } else if (title) {
      query.where('show_title', title)
    } else {
      return null
    }

    // Always filter by user ID to ensure per-user entries
    if (plexUserId) {
      query.where('plex_user_id', plexUserId)
    } else {
      // If no user ID provided, look for legacy global entries (null plex_user_id)
      query.whereNull('plex_user_id')
    }

    return await query.first()
  } catch (error) {
    this.log.error({ error }, 'Error getting rolling monitored show:')
    return null
  }
}

/**
 * Updates the last watched season and episode for a rolling monitored show.
 *
 * @param id - The unique identifier of the rolling monitored show
 * @param season - The season number to set as last watched
 * @param episode - The episode number to set as last watched
 * @returns True if the update was successful, false otherwise
 */
export async function updateRollingShowProgress(
  this: DatabaseService,
  id: number,
  season: number,
  episode: number,
): Promise<boolean> {
  try {
    const updated = await this.knex('rolling_monitored_shows')
      .where({ id })
      .update({
        last_watched_season: season,
        last_watched_episode: episode,
        last_session_date: this.timestamp,
        updated_at: this.timestamp,
        last_updated_at: this.timestamp,
      })

    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating rolling show progress:')
    return false
  }
}

/**
 * Updates the current monitored season for a rolling monitored show.
 *
 * @param id - The unique identifier of the rolling monitored show
 * @param season - The season number to set as the current monitored season
 * @returns True if the update was successful; otherwise, false
 */
export async function updateRollingShowMonitoredSeason(
  this: DatabaseService,
  id: number,
  season: number,
): Promise<boolean> {
  try {
    const updated = await this.knex('rolling_monitored_shows')
      .where({ id })
      .update({
        current_monitored_season: season,
        updated_at: this.timestamp,
        last_updated_at: this.timestamp,
      })

    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating rolling show monitored season:')
    return false
  }
}

/**
 * Deletes a rolling monitored show by its ID.
 *
 * @param id - The unique identifier of the rolling monitored show to delete
 * @returns True if a record was deleted; false otherwise
 */
export async function deleteRollingMonitoredShow(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  try {
    const deleted = await this.knex('rolling_monitored_shows')
      .where({ id })
      .delete()

    return deleted > 0
  } catch (error) {
    this.log.error({ error }, 'Error deleting rolling monitored show:')
    return false
  }
}

/**
 * Deletes all rolling monitored show entries for a specific show across all users.
 *
 * Removes every entry matching the same `sonarr_series_id` and `sonarr_instance_id` as the provided show ID within a transaction. Returns the number of deleted entries, or 0 if the show is not found or an error occurs.
 *
 * @param id - The ID of any rolling monitored show entry for the target show
 * @returns The number of deleted entries
 */
export async function deleteAllRollingMonitoredShowEntries(
  this: DatabaseService,
  id: number,
): Promise<number> {
  try {
    return await this.knex.transaction(async (trx) => {
      // Get the show details inside the transaction to avoid race conditions
      const rowQuery = trx('rolling_monitored_shows').where({ id })
      if (this.isPostgres) rowQuery.forUpdate() // row-level lock only on PG
      const show = await rowQuery.first()

      if (!show) {
        return 0
      }

      // Delete all entries for this show (all users)
      const deleted = await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .delete()

      this.log.info(
        `Deleted ${deleted} rolling monitored show entries for ${show.show_title} (series_id: ${show.sonarr_series_id}, instance_id: ${show.sonarr_instance_id})`,
      )

      return deleted
    })
  } catch (error) {
    this.log.error(
      { error },
      'Error deleting all rolling monitored show entries:',
    )
    return 0
  }
}

/**
 * Resets a rolling monitored show to its original state by deleting all user-specific entries and resetting the master record to season 1 with cleared progress.
 *
 * @param id - The ID of any rolling monitored show entry for the show
 * @returns The number of user entries deleted
 */
export async function resetRollingMonitoredShowToOriginal(
  this: DatabaseService,
  id: number,
): Promise<number> {
  try {
    return await this.knex.transaction(async (trx) => {
      // Get the show details inside the transaction to avoid race conditions
      const rowQuery = trx('rolling_monitored_shows').where({ id })
      if (this.isPostgres) rowQuery.forUpdate() // row-level lock only on PG
      const show = await rowQuery.first()

      if (!show) {
        return 0
      }
      // Delete all user entries (keep only master record)
      const deletedUserEntries = await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNotNull('plex_user_id') // Only delete user entries, not master
        .delete()

      // Reset the master record to original state (if it exists)
      await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNull('plex_user_id') // Only update master record
        .update({
          current_monitored_season: 1,
          last_watched_season: 0,
          last_watched_episode: 0,
          updated_at: this.timestamp,
          last_updated_at: this.timestamp,
        })

      this.log.info(
        `Reset ${show.show_title} to original state: removed ${deletedUserEntries} user entries, reset master record (series_id: ${show.sonarr_series_id}, instance_id: ${show.sonarr_instance_id})`,
      )

      return deletedUserEntries
    })
  } catch (error) {
    this.log.error(
      { error },
      'Error resetting rolling monitored show to original state',
    )
    return 0
  }
}

/**
 * Retrieves rolling monitored shows that have not been updated within the specified number of days.
 * Only returns shows where ALL records (master + all per-user records) are past the inactivity threshold.
 * This prevents cleanup of shows where some users are still actively watching.
 *
 * @param inactivityDays - The minimum number of days since the last update for a show to be considered inactive.
 * @returns An array of rolling monitored shows that are completely inactive (one representative record per show).
 */
export async function getInactiveRollingMonitoredShows(
  this: DatabaseService,
  inactivityDays: number,
): Promise<RollingMonitoredShow[]> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - inactivityDays)

    const allShows = await this.knex('rolling_monitored_shows').orderBy(
      'last_updated_at',
      'asc',
    )

    // Group by unique show identifier
    const showMap = new Map<string, RollingMonitoredShow[]>()

    for (const show of allShows) {
      const showKey = `${show.sonarr_series_id}-${show.sonarr_instance_id}`
      if (!showMap.has(showKey)) {
        showMap.set(showKey, [])
      }
      showMap.get(showKey)?.push(show)
    }

    // Find shows where ALL records are inactive
    const inactiveShows: RollingMonitoredShow[] = []

    for (const shows of showMap.values()) {
      const hasActiveRecord = shows.some(
        (show) => new Date(show.last_updated_at) >= cutoffDate,
      )

      if (!hasActiveRecord) {
        // All records inactive - prefer master record, fall back to any record
        const masterRecord = shows.find((show) => show.plex_user_id === null)
        inactiveShows.push(masterRecord || shows[0])
      }
    }

    return inactiveShows
  } catch (error) {
    this.log.error({ error }, 'Error getting inactive rolling monitored shows:')
    return []
  }
}
