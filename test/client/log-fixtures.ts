import type { LogEntry } from '@root/types/logs.types.js'

export const plainLine: LogEntry = {
  timestamp: '2026-10-15T21:17:02.364Z',
  level: 'info',
  module: 'RADARR',
  message: 'Bulk updated tags for 1 movies across 1 tag groups (mode: add)',
}

export const sentHope: LogEntry = {
  timestamp: '2026-10-15T21:17:03.315Z',
  level: 'info',
  module: 'RADARR',
  message: 'Sent Hope to Radarr',
  data: {
    title: 'Hope',
    qualityProfileId: 13,
    rootFolder: '/mnt/plex/nzb-movies',
    searchOnAdd: true,
  },
}

export const authRequired: LogEntry = {
  timestamp: '2026-10-15T06:53:12.642Z',
  level: 'warn',
  message: 'Authentication required',
  data: {
    reqId: 'req-141',
    err: {
      message: 'Plex did not accept the token',
      name: 'UnauthorizedError',
      status: 401,
    },
    request: { id: 'req-141', method: 'GET', path: '/v1/plex/ping' },
  },
}

export const configError: LogEntry = {
  timestamp: '2026-08-18T06:44:07.505Z',
  level: 'error',
  message: 'Error initializing config',
  data: {
    err: {
      name: 'SQLiteError',
      stack:
        'SQLiteError: no such column: maintainerrWebhookSecret\n    at prepare (bun:sqlite:345:37)',
      errno: 1,
    },
  },
}

export const pingFailed: LogEntry = {
  timestamp: '2026-10-15T07:12:21.119Z',
  level: 'error',
  module: 'PLEX_WATCHLIST',
  message: 'Plex ping failed with status 401: Unauthorized',
}

export function infoLine(index: number): LogEntry {
  return {
    timestamp: new Date(Date.UTC(2026, 9, 15, 20, 0, 0, index)).toISOString(),
    level: 'info',
    module: 'WATCHLIST_WORKFLOW',
    message: `Line ${index}`,
  }
}
