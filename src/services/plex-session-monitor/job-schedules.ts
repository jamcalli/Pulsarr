import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
import type { Config } from '@root/types/config.types.js'
import type { IntervalConfig } from '@root/types/scheduler.types.js'

export type SessionMonitorJob =
  | 'plex-session-monitor'
  | 'plex-rolling-auto-reset'
  | 'plex-rolling-pilot-sync'

export interface SessionMonitorJobSchedule {
  config: IntervalConfig
  enabled: boolean
}

/** Each job runs only while its feature is on, so the schedule rows follow the settings. */
export function sessionMonitorJobSchedules(
  settings: Config['plexSessionMonitoring'],
): Record<SessionMonitorJob, SessionMonitorJobSchedule> {
  const minutes =
    settings?.pollingIntervalMinutes ||
    PLEX_SESSION_MONITORING_DEFAULTS.pollingIntervalMinutes
  const hours =
    settings?.autoResetIntervalHours ||
    PLEX_SESSION_MONITORING_DEFAULTS.autoResetIntervalHours
  const monitoring =
    settings?.enabled ?? PLEX_SESSION_MONITORING_DEFAULTS.enabled
  const autoReset =
    settings?.enableAutoReset ??
    PLEX_SESSION_MONITORING_DEFAULTS.enableAutoReset
  return {
    'plex-session-monitor': { config: { minutes }, enabled: monitoring },
    'plex-rolling-auto-reset': {
      config: { hours },
      enabled: monitoring && autoReset,
    },
    'plex-rolling-pilot-sync': { config: { hours }, enabled: monitoring },
  }
}
