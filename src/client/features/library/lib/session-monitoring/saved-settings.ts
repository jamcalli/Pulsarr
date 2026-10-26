import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type MonitoringConfig = components['schemas']['PlexSessionMonitoringConfig']

/** The saved settings with every unset field at its default. */
export function savedSessionMonitoring(
  config: Config,
): Required<MonitoringConfig> {
  return {
    ...PLEX_SESSION_MONITORING_DEFAULTS,
    ...config.plexSessionMonitoring,
  }
}
