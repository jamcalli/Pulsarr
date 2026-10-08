import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { Config } from '@root/types/config.types.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'

export class PlaceholderResetError extends Error {
  constructor(service: 'Radarr' | 'Sonarr') {
    super(
      `Only the last real ${service} instance can be reset to placeholder values. Delete the instance instead`,
    )
    this.name = 'PlaceholderResetError'
  }
}

export function defaultRadarrInstance(
  config: Config,
): Omit<RadarrInstance, 'id'> {
  return {
    name: 'Default Radarr Instance',
    baseUrl: config.radarrBaseUrl,
    apiKey: config.radarrApiKey,
    qualityProfile: config.radarrQualityProfile,
    rootFolder: config.radarrRootFolder,
    bypassIgnored: config.radarrBypassIgnored,
    tags: config.radarrTags || [],
    isDefault: true,
  }
}

export function defaultSonarrInstance(
  config: Config,
): Omit<SonarrInstance, 'id'> {
  return {
    name: 'Default Sonarr Instance',
    baseUrl: config.sonarrBaseUrl,
    apiKey: config.sonarrApiKey,
    qualityProfile: config.sonarrQualityProfile,
    rootFolder: config.sonarrRootFolder,
    bypassIgnored: config.sonarrBypassIgnored,
    seasonMonitoring: config.sonarrSeasonMonitoring,
    monitorNewItems: config.sonarrMonitorNewItems || 'all',
    tags: config.sonarrTags || [],
    createSeasonFolders: config.sonarrCreateSeasonFolders,
    isDefault: true,
  }
}

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
