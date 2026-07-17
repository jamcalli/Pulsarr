/**
 * Shared fixture data for local Radarr / Sonarr mock servers.
 */

export const MOCK_API_KEY = 'mock-api-key'

export function createSystemStatus(appName: 'Radarr' | 'Sonarr') {
  return {
    appName,
    version: '5.0.0.0000',
    buildTime: '2024-01-01T00:00:00Z',
    isDebug: false,
    isProduction: true,
    isAdmin: true,
    isUserInteractive: false,
    startupPath: '/app',
    appData: '/config',
    osName: 'linux',
    osVersion: '6.0',
    isWindows: false,
    isLinux: true,
    isOsx: false,
    isDocker: true,
    mode: 'console',
    branch: 'master',
    authentication: 'none',
    sqliteVersion: '3.40.0',
    migrationVersion: 200,
    urlBase: '',
    runtimeVersion: '8.0.0',
    runtimeName: 'netcore',
    startTime: new Date().toISOString(),
    isNetCore: true,
    isMono: false,
    runtimeMode: 'Console',
  }
}

export const qualityProfiles = [
  {
    id: 1,
    name: 'HD-1080p',
    upgradeAllowed: true,
    cutoff: 7,
    items: [],
  },
]

export const rootFolders = [
  {
    id: 1,
    path: '/data/media',
    accessible: true,
    freeSpace: 1_000_000_000_000,
    unmappedFolders: [],
  },
]

export const defaultTags = [{ id: 1, label: 'pulsarr' }]

export function emptyPagedResult() {
  return {
    page: 1,
    pageSize: 1000,
    sortKey: 'id',
    sortDirection: 'ascending',
    totalRecords: 0,
    records: [],
  }
}
