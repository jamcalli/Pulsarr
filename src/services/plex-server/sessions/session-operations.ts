import type {
  PlexSession,
  PlexSessionResponse,
} from '@root/types/plex-session.types.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT_MS = 30_000

/** Throws when Plex cannot be reached or answers with an error, and an empty list means nobody is watching. */
export async function getActiveSessions(
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexSession[]> {
  if (!token) {
    log.warn('No Plex token provided for session monitoring')
    return []
  }

  const url = new URL('/status/sessions', serverUrl)
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
      'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
    },
    signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch sessions: ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as PlexSessionResponse
  const sessions = data.MediaContainer.Metadata || []

  log.debug(`Found ${sessions.length} active Plex sessions`)
  return sessions
}
