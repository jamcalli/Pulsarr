import {
  SEASON_MONITORING_LABELS,
  SONARR_ROLLING_MONITOR_OPTIONS,
  SONARR_UI_MONITOR_OPTIONS,
} from '@root/schemas/sonarr/season-monitoring.schema'
import { withStoredOption } from '@/lib/select-options'
import type { components } from '@/types/api.js'

type ApprovalRouting = components['schemas']['ApprovalRouting']

export const ARR_TYPE_LABELS: Record<ApprovalRouting['instanceType'], string> =
  {
    radarr: 'Radarr',
    sonarr: 'Sonarr',
  }

export function arrTypeOf(
  contentType: 'movie' | 'show',
): ApprovalRouting['instanceType'] {
  return contentType === 'movie' ? 'radarr' : 'sonarr'
}

export const SERIES_TYPE_LABELS: Record<
  components['schemas']['SonarrSeriesType'],
  string
> = {
  standard: 'Standard',
  anime: 'Anime',
  daily: 'Daily',
}

const SEASON_MONITORING_OPTION_LABELS = new Map<string, string>(
  Object.entries(SEASON_MONITORING_LABELS),
)

/** Falls back to the raw value for a Sonarr option outside this map. */
export function seasonMonitoringLabel(value: string): string {
  return SEASON_MONITORING_OPTION_LABELS.get(value) ?? value
}

/** Rolling modes stay disabled until Plex session monitoring is on, and a stored value outside the list is kept as a raw option. */
export function seasonMonitoringOptions(
  stored: string | null,
  rollingEnabled: boolean,
): Array<{ value: string; label: string; disabled?: boolean }> {
  return withStoredOption(
    [
      ...SONARR_UI_MONITOR_OPTIONS.map((value) => ({
        value,
        label: SEASON_MONITORING_LABELS[value],
      })),
      ...SONARR_ROLLING_MONITOR_OPTIONS.map((value) => ({
        value,
        label: SEASON_MONITORING_LABELS[value],
        disabled: !rollingEnabled,
      })),
    ],
    stored,
  )
}
