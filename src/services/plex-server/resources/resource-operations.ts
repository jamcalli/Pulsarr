/**
 * Resource Operations Module
 *
 * Provides functions for fetching Plex resources from the plex.tv API.
 * All operations require a valid authentication token.
 */

import type { PlexResource } from '@root/types/plex-server.types.js'
import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT = 10000 // 10 seconds

/**
 * Fetches all Plex resources (servers) from plex.tv API
 *
 * @param token - The Plex token to use for authentication
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to array of PlexResource objects
 */
export async function getAllPlexResources(
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexResource[]> {
  try {
    const url = new URL('https://plex.tv/api/v2/resources')
    url.searchParams.append('includeHttps', '1')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(`Plex.tv API error: ${response.statusText}`)
    }

    const data = (await response.json()) as PlexResource[]
    return data.filter((resource) => resource.provides === 'server')
  } catch (error) {
    log.error({ error }, 'Error fetching Plex resources')
    return []
  }
}
