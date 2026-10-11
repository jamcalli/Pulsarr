import { z } from 'zod'

/** Sonarr's add-series monitor options in the order its UI lists them. */
export const SONARR_UI_MONITOR_OPTIONS = [
  'all',
  'future',
  'missing',
  'existing',
  'recent',
  'pilot',
  'firstSeason',
  'lastSeason',
  'monitorSpecials',
  'unmonitorSpecials',
  'none',
] as const

/** Pulsarr-only modes that need Plex session monitoring and map to a real Sonarr option on add. */
export const SONARR_ROLLING_MONITOR_OPTIONS = [
  'pilotRolling',
  'firstSeasonRolling',
  'allSeasonPilotRolling',
] as const

/** Sonarr's API accepts these but its UI never offers them. */
export const SONARR_API_ONLY_MONITOR_OPTIONS = [
  'unknown',
  'latestSeason',
  'skip',
] as const

export type SonarrUiMonitorOption = (typeof SONARR_UI_MONITOR_OPTIONS)[number]
export type SonarrRollingMonitorOption =
  (typeof SONARR_ROLLING_MONITOR_OPTIONS)[number]
export type SonarrApiOnlyMonitorOption =
  (typeof SONARR_API_ONLY_MONITOR_OPTIONS)[number]
/** A value Sonarr's own API accepts as `addOptions.monitor`. */
export type SonarrMonitorType =
  | SonarrUiMonitorOption
  | SonarrApiOnlyMonitorOption
export type SonarrSeasonMonitoring =
  | SonarrMonitorType
  | SonarrRollingMonitorOption

export const SonarrSeasonMonitoringSchema = z
  .enum([
    ...SONARR_UI_MONITOR_OPTIONS,
    ...SONARR_ROLLING_MONITOR_OPTIONS,
    ...SONARR_API_ONLY_MONITOR_OPTIONS,
  ])
  .meta({
    id: 'SonarrSeasonMonitoring',
    description:
      'Season monitoring applied when adding a series, any Sonarr monitor type or a Pulsarr rolling mode',
  })

/** Accepts any string so rows saved before validation still read and round-trip, and services reject only new unknown values. */
export const SonarrSeasonMonitoringValueSchema = z
  .union([SonarrSeasonMonitoringSchema, z.string()])
  .meta({
    id: 'SonarrSeasonMonitoringValue',
    description:
      'A SonarrSeasonMonitoring option, or a legacy value already stored on the record',
  })

export const SonarrRollingMonitoringSchema = z
  .enum(SONARR_ROLLING_MONITOR_OPTIONS)
  .meta({
    id: 'SonarrRollingMonitoring',
    description: 'Rolling monitoring strategy for a show',
  })

export const SEASON_MONITORING_LABELS: Record<
  SonarrUiMonitorOption | SonarrRollingMonitorOption,
  string
> = {
  all: 'All episodes',
  future: 'Future episodes',
  missing: 'Missing episodes',
  existing: 'Existing episodes',
  recent: 'Recent episodes',
  pilot: 'Pilot episode',
  firstSeason: 'First season',
  lastSeason: 'Last season',
  monitorSpecials: 'Monitor specials',
  unmonitorSpecials: 'Unmonitor specials',
  none: 'None',
  pilotRolling: 'Pilot rolling',
  firstSeasonRolling: 'First season rolling',
  allSeasonPilotRolling: 'All seasons pilot rolling',
}

const ROLLING_OPTIONS = new Set<string>(SONARR_ROLLING_MONITOR_OPTIONS)

export function isRollingMonitoringOption(
  option: string,
): option is SonarrRollingMonitorOption {
  return ROLLING_OPTIONS.has(option)
}
