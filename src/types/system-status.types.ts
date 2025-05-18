/**
 * System status response from Radarr/Sonarr API v3
 */
export interface SystemStatus {
  appName: string
  version: string
  buildTime: string
  isDebug: boolean
  isProduction: boolean
  isAdmin: boolean
  isUserInteractive: boolean
  startupPath: string
  appData: string
  osName: string
  osVersion: string
  isWindows: boolean
  isLinux: boolean
  isOsx: boolean
  isDocker: boolean
  mode: string
  branch: string
  authentication: string
  sqliteVersion: string
  migrationVersion: number
  urlBase: string
  runtimeVersion: string
  runtimeName: string
  startTime: string
  packageVersion?: string
  packageAuthor?: string
  packageUpdateMechanism?: string
  isNetCore: boolean
  isMono: boolean
  runtimeMode: string
  databaseVersion?: string
  analyticsEnabled?: boolean
}

/**
 * Type guard to check if response is a valid SystemStatus
 */
export function isSystemStatus(obj: unknown): obj is SystemStatus {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'appName' in obj &&
    typeof (obj as SystemStatus).appName === 'string'
  )
}

/**
 * Type guard to check if it's a Radarr system status
 */
export function isRadarrStatus(status: SystemStatus): boolean {
  // The appName is hardcoded in Radarr as 'Radarr'
  return status.appName.toLowerCase() === 'radarr'
}

/**
 * Type guard to check if it's a Sonarr system status
 */
export function isSonarrStatus(status: SystemStatus): boolean {
  // The appName is hardcoded in Sonarr as 'Sonarr'
  return status.appName.toLowerCase() === 'sonarr'
}
