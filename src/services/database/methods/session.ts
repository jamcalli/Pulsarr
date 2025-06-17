import type { DatabaseService } from '@services/database.service.js'
import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'

/**
 * Creates a new rolling monitored show entry
 *
 * @param data - The rolling monitored show data
 * @returns Promise resolving to the created entry ID
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
    this.log.error('Error creating rolling monitored show:', error)
    throw new Error('Failed to create rolling monitored show')
  }
}

/**
 * Gets all rolling monitored shows
 *
 * @returns Promise resolving to array of rolling monitored shows
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
    this.log.error('Error getting rolling monitored shows:', error)
    return []
  }
}

/**
 * Gets a rolling monitored show by ID
 *
 * @param id - The rolling monitored show ID
 * @returns Promise resolving to the rolling monitored show or null
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
    this.log.error('Error getting rolling monitored show by ID:', error)
    return null
  }
}

/**
 * Gets a rolling monitored show by TVDB ID or title for a specific user
 *
 * @param tvdbId - The TVDB ID
 * @param title - The show title
 * @param plexUserId - The Plex user ID for per-user tracking
 * @returns Promise resolving to the rolling monitored show or null
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
    this.log.error('Error getting rolling monitored show:', error)
    return null
  }
}

/**
 * Updates rolling show progress
 *
 * @param id - The rolling monitored show ID
 * @param season - The last watched season
 * @param episode - The last watched episode
 * @returns Promise resolving to boolean indicating success
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
    this.log.error('Error updating rolling show progress:', error)
    return false
  }
}

/**
 * Updates the current monitored season for a rolling show
 *
 * @param id - The rolling monitored show ID
 * @param season - The new current monitored season
 * @returns Promise resolving to boolean indicating success
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
    this.log.error('Error updating rolling show monitored season:', error)
    return false
  }
}

/**
 * Deletes a rolling monitored show
 *
 * @param id - The rolling monitored show ID
 * @returns Promise resolving to boolean indicating success
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
    this.log.error('Error deleting rolling monitored show:', error)
    return false
  }
}

/**
 * Deletes all rolling monitored show entries for a given show
 * (all users watching the same sonarr_series_id + sonarr_instance_id)
 *
 * @param id - The ID of any rolling monitored show entry for the show
 * @returns Promise resolving to number of deleted entries
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
    this.log.error('Error deleting all rolling monitored show entries:', error)
    return 0
  }
}

/**
 * Resets a rolling monitored show to its original state:
 * - Removes all user entries
 * - Resets master record to season 1
 *
 * @param id - The ID of any rolling monitored show entry for the show
 * @returns Promise resolving to number of user entries deleted
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
        })

      this.log.info(
        `Reset ${show.show_title} to original state: removed ${deletedUserEntries} user entries, reset master record (series_id: ${show.sonarr_series_id}, instance_id: ${show.sonarr_instance_id})`,
      )

      return deletedUserEntries
    })
  } catch (error) {
    this.log.error(
      'Error resetting rolling monitored show to original state:',
      error,
    )
    return 0
  }
}

/**
 * Gets rolling monitored shows that haven't been updated recently
 *
 * @param inactivityDays - Number of days since last update to consider inactive
 * @returns Promise resolving to array of inactive rolling monitored shows
 */
export async function getInactiveRollingMonitoredShows(
  this: DatabaseService,
  inactivityDays: number,
): Promise<RollingMonitoredShow[]> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - inactivityDays)

    return await this.knex('rolling_monitored_shows')
      .where('last_updated_at', '<', cutoffDate.toISOString())
      .orderBy('last_updated_at', 'asc')
  } catch (error) {
    this.log.error('Error getting inactive rolling monitored shows:', error)
    return []
  }
}
