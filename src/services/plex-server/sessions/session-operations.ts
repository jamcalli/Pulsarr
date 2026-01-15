/**
 * Session Operations Module
 *
 * Provides functions for monitoring active Plex playback sessions.
 * All operations require a valid server URL and authentication token.
 */

import type {
  PlexSession,
  PlexSessionResponse,
} from '@root/types/plex-session.types.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT = 30000 // 30 seconds

/**
 * Retrieves active Plex sessions from the server
 *
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to array of active sessions
 */
export async function getActiveSessions(
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexSession[]> {
  try {
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
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
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
  } catch (error) {
    log.error({ error }, 'Error fetching Plex sessions:')
    return []
  }
}
