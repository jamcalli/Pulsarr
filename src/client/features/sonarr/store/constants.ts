import type { SonarrMonitoringType } from '@/features/sonarr/types/types'

export const SONARR_MONITORING_OPTIONS: Record<SonarrMonitoringType, string> = {
  unknown: 'Unknown',
  all: 'All Seasons',
  future: 'Future Seasons',
  missing: 'Missing Episodes',
  existing: 'Existing Episodes',
  firstSeason: 'First Season',
  lastSeason: 'Last Season',
  latestSeason: 'Latest Season',
  pilot: 'Pilot Only',
  pilotRolling: 'Pilot Rolling (Auto-expand)',
  firstSeasonRolling: 'First Season Rolling (Auto-expand)',
  recent: 'Recent Episodes',
  monitorSpecials: 'Monitor Specials',
  unmonitorSpecials: 'Unmonitor Specials',
  none: 'None',
  skip: 'Skip',
}

export const API_KEY_PLACEHOLDER = 'placeholder'
