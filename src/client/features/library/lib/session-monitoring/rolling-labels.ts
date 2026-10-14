import {
  SEASON_MONITORING_LABELS,
  SonarrRollingMonitoringSchema,
} from '@root/schemas/sonarr/season-monitoring.schema'
import type { components } from '@/types/api.js'

type RollingMode = components['schemas']['SonarrRollingMonitoring']
type RollingUpdateAction =
  components['schemas']['SessionMonitoringRollingUpdate']['action']

export const ROLLING_MODE_OPTIONS: ReadonlyArray<{
  value: RollingMode
  label: string
}> = SonarrRollingMonitoringSchema.options.map((value) => ({
  value,
  label: SEASON_MONITORING_LABELS[value],
}))

export const ROLLING_UPDATE_LABELS: Record<RollingUpdateAction, string> = {
  expanded_to_season: 'Expanded to a season',
  expanded_to_next_season: 'Expanded to next season',
  switched_to_all: 'Monitoring everything',
}

/** What a show monitors right after a reset or a start over in each mode. */
export const ROLLING_MODE_START: Record<RollingMode, string> = {
  pilotRolling: 'the pilot',
  firstSeasonRolling: 'season 1',
  allSeasonPilotRolling: 'the pilot of every season',
}

export const ROLLING_MODE_HELP: Record<RollingMode, string> = {
  pilotRolling: 'Starts with the pilot and expands to season 1 once watched.',
  firstSeasonRolling: 'Starts with the whole first season.',
  allSeasonPilotRolling:
    "Adds every season's pilot, even without starting over.",
}
