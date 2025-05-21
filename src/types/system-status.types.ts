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
 * Checks if a value is a system status response from Radarr or Sonarr API v3.
 *
 * Returns `true` if the object contains the required core fields expected in a {@link SystemStatus} response.
 */
export function isSystemStatus(obj: unknown): obj is SystemStatus {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'appName' in obj &&
    typeof (obj as SystemStatus).appName === 'string' &&
    'version' in obj &&
    typeof (obj as SystemStatus).version === 'string' &&
    'branch' in obj &&
    typeof (obj as SystemStatus).branch === 'string' &&
    'authentication' in obj &&
    typeof (obj as SystemStatus).authentication === 'string'
  )
}

/**
 * Checks whether the given system status object is from a Radarr instance.
 *
 * @param status - The system status object to evaluate.
 * @returns True if the {@link status} represents Radarr; otherwise, false.
 */
export function isRadarrStatus(status: SystemStatus): boolean {
  // The appName is hardcoded in Radarr as 'Radarr'
  return status.appName.toLowerCase() === 'radarr'
}

/**
 * Checks if the given {@link SystemStatus} object represents a Sonarr instance.
 *
 * @param status - The system status object to check.
 * @returns True if the {@link status} is from Sonarr; otherwise, false.
 */
export function isSonarrStatus(status: SystemStatus): boolean {
  // The appName is hardcoded in Sonarr as 'Sonarr'
  return status.appName.toLowerCase() === 'sonarr'
}
