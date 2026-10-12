import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'

export const ARR_API_KEY_PLACEHOLDER = 'placeholder'

/** The inert row left after the last real instance is removed, never read from config. */
export function placeholderRadarrInstance(): Omit<RadarrInstance, 'id'> {
  return {
    name: 'Default Radarr Instance',
    baseUrl: 'http://localhost:7878',
    apiKey: ARR_API_KEY_PLACEHOLDER,
    qualityProfile: '',
    rootFolder: '',
    bypassIgnored: false,
    searchOnAdd: true,
    minimumAvailability: 'released',
    tags: [],
    syncedInstances: [],
    isDefault: true,
  }
}

/** The inert row left after the last real instance is removed, never read from config. */
export function placeholderSonarrInstance(): Omit<SonarrInstance, 'id'> {
  return {
    name: 'Default Sonarr Instance',
    baseUrl: 'http://localhost:8989',
    apiKey: ARR_API_KEY_PLACEHOLDER,
    qualityProfile: '',
    rootFolder: '',
    bypassIgnored: false,
    seasonMonitoring: 'all',
    monitorNewItems: 'all',
    searchOnAdd: true,
    createSeasonFolders: false,
    seriesType: 'standard',
    tags: [],
    syncedInstances: [],
    isDefault: true,
  }
}
