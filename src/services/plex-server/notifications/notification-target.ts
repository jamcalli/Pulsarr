import { PLEX_DEFAULT_PORT } from '@root/schemas/plex/configure-notifications.schema.js'

const HTTPS_DEFAULT_PORT = 443

export interface PlexNotificationTarget {
  plexToken: string
  plexHost: string
  plexPort: number
  useSsl: boolean
}

export interface NotificationTargetInput {
  plexToken?: string
  plexHost?: string
  plexPort?: number
  useSsl?: boolean
}

/** Body fields win, a missing host takes host, port and SSL from the server's current connection, and a missing token takes the linked one. */
export function resolveNotificationTarget(
  body: NotificationTargetInput,
  serverUrl: string,
  linkedToken: string | undefined,
): PlexNotificationTarget | null {
  const plexToken = body.plexToken ?? linkedToken
  if (!plexToken) return null
  if (body.plexHost) {
    return {
      plexToken,
      plexHost: body.plexHost,
      plexPort: body.plexPort ?? PLEX_DEFAULT_PORT,
      useSsl: body.useSsl ?? false,
    }
  }
  const url = new URL(serverUrl)
  const useSsl = url.protocol === 'https:'
  return {
    plexToken,
    plexHost: url.hostname,
    plexPort: url.port
      ? Number(url.port)
      : useSsl
        ? HTTPS_DEFAULT_PORT
        : PLEX_DEFAULT_PORT,
    useSsl,
  }
}
