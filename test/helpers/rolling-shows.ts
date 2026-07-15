import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import type { Knex } from 'knex'

export async function insertRollingShow(
  knex: Knex,
  overrides: Partial<RollingMonitoredShow> & {
    show_title: string
    monitoring_type: RollingMonitoredShow['monitoring_type']
    sonarr_series_id: number
    sonarr_instance_id: number
    tvdb_id: string
  },
): Promise<number> {
  const now = new Date().toISOString()
  const [result] = await knex('rolling_monitored_shows')
    .insert({
      current_monitored_season: 1,
      last_watched_season: 0,
      last_watched_episode: 0,
      last_session_date: now,
      created_at: now,
      updated_at: now,
      last_updated_at: now,
      ...overrides,
    })
    .returning('id')
  return typeof result === 'object' ? result.id : (result as number)
}
