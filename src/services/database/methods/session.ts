import {
  ROLLING_BASELINE_SEASON,
  type SonarrRollingMonitorOption,
} from '@root/schemas/sonarr/season-monitoring.schema.js'
import type {
  NewRollingMonitoredShow,
  RollingMonitoredShow,
  RollingShowMatches,
} from '@root/types/plex-session.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { isUniqueViolation } from '@utils/db-errors.js'
import { normalizeTitle } from '@utils/title-normalization.js'

export async function createRollingMonitoredShow(
  this: DatabaseService,
  data: NewRollingMonitoredShow,
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

/** Race-safe through the unique (sonarr_series_id, sonarr_instance_id, plex_user_id) constraint, returns the new or existing row id. */
export async function createOrFindUserRollingMonitoredShow(
  this: DatabaseService,
  globalShow: RollingMonitoredShow,
  plexUserId: string,
  plexUsername: string,
  plexUserUuid: string | null = null,
): Promise<number> {
  const now = this.timestamp
  const values = {
    sonarr_series_id: globalShow.sonarr_series_id,
    sonarr_instance_id: globalShow.sonarr_instance_id,
    tvdb_id: globalShow.tvdb_id,
    imdb_id: globalShow.imdb_id,
    show_title: globalShow.show_title,
    monitoring_type: globalShow.monitoring_type,
    current_monitored_season:
      ROLLING_BASELINE_SEASON[globalShow.monitoring_type],
    plex_user_id: plexUserId,
    plex_username: plexUsername,
    plex_user_uuid: plexUserUuid,
    last_watched_season: 0,
    last_watched_episode: 0,
    last_session_date: now,
    created_at: now,
    updated_at: now,
    last_updated_at: now,
  }

  try {
    if (this.isPostgres) {
      // DO UPDATE so Postgres returns the existing id on conflict
      const result = await this.knex('rolling_monitored_shows')
        .insert(values)
        .onConflict(['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'])
        .merge({
          last_updated_at: now,
          updated_at: now,
        })
        .returning('id')

      if (result && result.length > 0) {
        const id = this.extractId(result)
        this.log.info(
          `Created/updated per-user rolling show entry for ${globalShow.show_title} for user ${plexUsername} (ID: ${id})`,
        )
        return id
      }
    } else {
      // DO NOTHING returns no id on conflict, so the select below finds the existing row
      const result = await this.knex('rolling_monitored_shows')
        .insert(values)
        .onConflict(['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'])
        .ignore()
        .returning('id')

      if (result && result.length > 0) {
        const id = this.extractId(result)
        this.log.info(
          `Created/updated per-user rolling show entry for ${globalShow.show_title} for user ${plexUsername} (ID: ${id})`,
        )
        return id
      }
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      this.log.error({ error }, 'Unexpected error inserting per-user entry')
      throw error
    }
    this.log.debug(
      { error },
      `Insert conflict for per-user entry (${globalShow.show_title}, user: ${plexUsername}), looking up existing entry`,
    )
  }

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

/** Empty on a database error. */
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

/** Null when missing or on a database error. */
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

/** Matches by tvdbId, else by normalized title on rows without a conflicting tvdb id, returning that viewer's rows or the master rows when plexUserId is omitted. */
export async function getRollingMonitoredShowMatches(
  this: DatabaseService,
  tvdbId?: string,
  title?: string,
  plexUserId?: string,
): Promise<RollingShowMatches> {
  const scoped = () => {
    const query = this.knex('rolling_monitored_shows')
    if (plexUserId) {
      query.where('plex_user_id', plexUserId)
    } else {
      query.whereNull('plex_user_id')
    }
    return query.orderBy('sonarr_instance_id', 'asc')
  }

  try {
    if (tvdbId) {
      const shows: RollingMonitoredShow[] = await scoped().where(
        'tvdb_id',
        tvdbId,
      )
      if (shows.length > 0) return { matchedBy: 'tvdb', shows }
    }

    if (!title) return { matchedBy: 'none', shows: [] }

    const titleKey = normalizeTitle(title)
    const rows: RollingMonitoredShow[] = await scoped()
    // A differing stored tvdb id is a different show, which a bare title cannot tell apart
    const shows = rows.filter(
      (show) =>
        normalizeTitle(show.show_title) === titleKey &&
        (!tvdbId || !show.tvdb_id || show.tvdb_id === tvdbId),
    )
    if (shows.length === 0) return { matchedBy: 'none', shows: [] }

    // One show synced to several instances shares a tvdb id, so only differing ids make a title ambiguous
    const distinctShows = new Set(
      shows.map(
        (show) =>
          show.tvdb_id || `${show.sonarr_instance_id}-${show.sonarr_series_id}`,
      ),
    )
    if (distinctShows.size > 1)
      return { matchedBy: 'ambiguousTitle', shows: [] }

    return { matchedBy: 'title', shows }
  } catch (error) {
    this.log.error({ error }, 'Error getting rolling monitored show matches:')
    return { matchedBy: 'none', shows: [] }
  }
}

/** Also stamps last_session_date, which inactivity reset and cleanup read as viewing activity. */
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

/** Leaves activity timestamps alone so an identity refresh never counts as viewing activity. */
export async function updateRollingShowUserIdentity(
  this: DatabaseService,
  id: number,
  plexUsername: string,
  plexUserUuid: string | null,
): Promise<boolean> {
  try {
    const update: Partial<
      Pick<
        RollingMonitoredShow,
        'plex_username' | 'plex_user_uuid' | 'updated_at'
      >
    > = {
      plex_username: plexUsername,
      updated_at: this.timestamp,
    }
    if (plexUserUuid) {
      update.plex_user_uuid = plexUserUuid
    }

    const updated = await this.knex('rolling_monitored_shows')
      .where({ id })
      .whereNotNull('plex_user_id')
      .update(update)

    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating rolling show user identity:')
    return false
  }
}

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

/** Deletes the master and every per-user row of the show that row id belongs to, 0 on error. */
export async function deleteAllRollingMonitoredShowEntries(
  this: DatabaseService,
  id: number,
): Promise<number> {
  try {
    return await this.knex.transaction(async (trx) => {
      // Lock the master first, since locking the caller's row while updateRollingShowMonitoringType locks master-first deadlocks Postgres.
      const show = await trx('rolling_monitored_shows').where({ id }).first()

      if (!show) {
        return 0
      }

      const masterQuery = trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNull('plex_user_id')
      if (this.isPostgres) masterQuery.forUpdate() // row-level lock only on PG
      await masterQuery.first()

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

/** Deletes the per-user rows and resets the master to its baseline season, returning the per-user rows deleted. */
export async function resetRollingMonitoredShowToOriginal(
  this: DatabaseService,
  id: number,
): Promise<number> {
  try {
    return await this.knex.transaction(async (trx) => {
      // Lock the master first, since locking the caller's row while updateRollingShowMonitoringType locks master-first deadlocks Postgres.
      const show = await trx('rolling_monitored_shows').where({ id }).first()

      if (!show) {
        return 0
      }

      // Master row owns monitoring_type because a user row's copy can be stale.
      const masterQuery = trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNull('plex_user_id')
      if (this.isPostgres) masterQuery.forUpdate() // row-level lock only on PG
      const master: RollingMonitoredShow | undefined = await masterQuery.first()

      if (!master) {
        return 0
      }

      const deletedUserEntries = await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNotNull('plex_user_id')
        .delete()

      await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: show.sonarr_series_id,
          sonarr_instance_id: show.sonarr_instance_id,
        })
        .whereNull('plex_user_id')
        .update({
          current_monitored_season:
            ROLLING_BASELINE_SEASON[master.monitoring_type],
          last_watched_season: 0,
          last_watched_episode: 0,
          updated_at: this.timestamp,
          last_updated_at: this.timestamp,
        })

      this.log.info(
        `Reset ${master.show_title} to original state: removed ${deletedUserEntries} user entries, reset master record (series_id: ${show.sonarr_series_id}, instance_id: ${show.sonarr_instance_id})`,
      )

      return deletedUserEntries
    })
  } catch (error) {
    this.log.error(
      { error },
      'Error resetting rolling monitored show to original state',
    )
    throw error
  }
}

/** Matches either id because entries enrolled without a TVDB GUID store an empty tvdb_id. */
export async function deleteRollingMonitoredShowsByIds(
  this: DatabaseService,
  tvdbIds: string[],
  sonarrSeriesIds: number[],
): Promise<number> {
  if (tvdbIds.length === 0 && sonarrSeriesIds.length === 0) return 0

  try {
    const query = this.knex('rolling_monitored_shows').where((builder) => {
      if (tvdbIds.length > 0) {
        builder.whereIn('tvdb_id', tvdbIds)
      }
      if (sonarrSeriesIds.length > 0) {
        builder.orWhereIn('sonarr_series_id', sonarrSeriesIds)
      }
    })

    const deleted = await query.delete()

    if (deleted > 0) {
      this.log.info(
        `Deleted ${deleted} rolling monitored show entries (${tvdbIds.length} TVDB IDs, ${sonarrSeriesIds.length} Sonarr series IDs)`,
      )
    }

    return deleted
  } catch (error) {
    this.log.error({ error }, 'Error deleting rolling monitored shows by IDs:')
    return 0
  }
}

/** One row per show (the master when present) whose master and per-user rows are all past the cutoff. */
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

    const showMap = new Map<string, RollingMonitoredShow[]>()

    for (const show of allShows) {
      const showKey = `${show.sonarr_series_id}-${show.sonarr_instance_id}`
      if (!showMap.has(showKey)) {
        showMap.set(showKey, [])
      }
      showMap.get(showKey)?.push(show)
    }

    const inactiveShows: RollingMonitoredShow[] = []

    for (const shows of showMap.values()) {
      const hasActiveRecord = shows.some(
        (show) => new Date(show.last_updated_at) >= cutoffDate,
      )

      if (!hasActiveRecord) {
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

/** Writes the type to every row of the show but the season to the master only, false when id is not a master. */
export async function updateRollingShowMonitoringType(
  this: DatabaseService,
  id: number,
  monitoringType: SonarrRollingMonitorOption,
  currentMonitoredSeason: number,
): Promise<boolean> {
  try {
    return await this.knex.transaction(async (trx) => {
      const masterQuery = trx('rolling_monitored_shows')
        .where({ id })
        .whereNull('plex_user_id')
      if (this.isPostgres) masterQuery.forUpdate() // row-level lock only on PG
      const master = await masterQuery.first()

      if (!master) {
        return false
      }

      // The session monitor reads monitoring_type from per-user rows, so the type change must reach them too.
      await trx('rolling_monitored_shows')
        .where({
          sonarr_series_id: master.sonarr_series_id,
          sonarr_instance_id: master.sonarr_instance_id,
        })
        .update({
          monitoring_type: monitoringType,
          updated_at: this.timestamp,
          last_updated_at: this.timestamp,
        })

      await trx('rolling_monitored_shows')
        .where({ id })
        .update({ current_monitored_season: currentMonitoredSeason })

      return true
    })
  } catch (error) {
    this.log.error(
      { error, id, monitoringType },
      'Error updating rolling show monitoring type',
    )
    return false
  }
}
