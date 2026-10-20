import { SonarrRollingMonitoringSchema } from '@root/schemas/sonarr/season-monitoring.schema'
import { seasonName } from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import type {
  ShowsSortKey,
  ShowsState,
} from '@/features/library/lib/session-monitoring/shows-state'
import { compareSortValues, compareText } from '@/lib/format'
import type { components } from '@/types/api.js'

export type RollingRecord = components['schemas']['RollingMonitoredShow']
export type RollingMode = components['schemas']['SonarrRollingMonitoring']

export interface RollingShow {
  /** The row with no Plex user, whose id the reset and stop endpoints take. */
  record: RollingRecord
  /** Newest session first. */
  viewers: RollingRecord[]
}

export interface RollingShowRow extends RollingShow {
  instanceName: string
  /** Listed by the server's inactive endpoint for the saved inactivity period. */
  inactive: boolean
}

function showKey(record: RollingRecord): string {
  return `${record.sonarr_instance_id}:${record.sonarr_series_id}`
}

function sessionTime(record: RollingRecord): number {
  return record.last_session_date ? Date.parse(record.last_session_date) : 0
}

/** Viewer rows without a show record are dropped, since nothing can act on them. */
export function groupRollingShows(
  records: readonly RollingRecord[],
): RollingShow[] {
  const viewers = new Map<string, RollingRecord[]>()
  for (const record of records) {
    if (record.plex_user_id == null) continue
    const key = showKey(record)
    const list = viewers.get(key)
    if (list) list.push(record)
    else viewers.set(key, [record])
  }
  return records
    .filter((record) => record.plex_user_id == null)
    .map((record) => ({
      record,
      viewers: (viewers.get(showKey(record)) ?? []).sort(
        (a, b) => sessionTime(b) - sessionTime(a),
      ),
    }))
}

/** Matches by show, since the server may return a viewer row for an inactive show. */
export function inactiveShowKeys(
  inactive: readonly RollingRecord[],
): ReadonlySet<string> {
  return new Set(inactive.map(showKey))
}

export function isInactive(
  show: RollingShow,
  inactiveKeys: ReadonlySet<string>,
): boolean {
  return inactiveKeys.has(showKey(show.record))
}

/** All season pilot rolling sits at season 0 until a season expands, and after a reset. */
export function isPilotsOnly(record: RollingRecord): boolean {
  return (
    record.monitoring_type === 'allSeasonPilotRolling' &&
    record.current_monitored_season === 0
  )
}

export function seasonLabel(record: RollingRecord): string {
  return isPilotsOnly(record)
    ? 'Pilots only'
    : seasonName(record.current_monitored_season)
}

/** Null when nobody has watched the show. */
export function lastSession(show: RollingShow): string | null {
  return show.viewers[0]?.last_session_date ?? null
}

/** Each column's sort value, in ascending order. */
export const SHOW_SORT_VALUES: Record<
  ShowsSortKey,
  (row: RollingShowRow) => string | number
> = {
  show: (row) => row.record.show_title,
  mode: (row) =>
    SonarrRollingMonitoringSchema.options.indexOf(row.record.monitoring_type),
  season: (row) =>
    isPilotsOnly(row.record) ? -1 : row.record.current_monitored_season,
  viewers: (row) => row.viewers.length,
  last: (row) => {
    const last = lastSession(row)
    return Date.parse(last ?? row.record.created_at)
  },
}

function matches(row: RollingShowRow, state: ShowsState): boolean {
  const needle = state.q.trim().toLowerCase()
  return (
    (needle === '' || row.record.show_title.toLowerCase().includes(needle)) &&
    (state.mode === null || row.record.monitoring_type === state.mode) &&
    (state.status === null || (state.status === 'inactive') === row.inactive)
  )
}

export function visibleShows(
  rows: readonly RollingShowRow[],
  state: ShowsState,
): RollingShowRow[] {
  const direction = state.dir === 'desc' ? -1 : 1
  const value = SHOW_SORT_VALUES[state.sort]
  return rows
    .filter((row) => matches(row, state))
    .sort(
      (a, b) =>
        compareSortValues(value(a), value(b)) * direction ||
        compareText(a.record.show_title, b.record.show_title),
    )
}
