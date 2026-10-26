import { PLEX_DEFAULT_PORT } from '@root/schemas/plex/configure-notifications.schema.js'

const HTTPS_DEFAULT_PORT = 443
const HTTP_DEFAULT_PORT = 80

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

/** Sent fields win, the rest come from the current server address and the linked token. */
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
  const useSsl = body.useSsl ?? url.protocol === 'https:'
  const urlPort = url.port ? Number(url.port) : null
  return {
    plexToken,
    plexHost: url.hostname,
    plexPort:
      body.plexPort ??
      urlPort ??
      (useSsl ? HTTPS_DEFAULT_PORT : HTTP_DEFAULT_PORT),
    useSsl,
  }
}
