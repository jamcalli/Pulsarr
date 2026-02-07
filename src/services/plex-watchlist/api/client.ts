import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

/**
 * Validates a Plex token by pinging the Plex API.
 *
 * @param token - The Plex authentication token to validate
 * @param log - Fastify logger instance
 * @returns `true` if the token is valid; otherwise, `false`
 */
export const pingPlex = async (
  token: string,
  log: FastifyBaseLogger,
): Promise<boolean> => {
  try {
    const url = new URL('https://plex.tv/api/v2/ping')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.error(
        `Plex ping failed with status ${response.status}: ${response.statusText}`,
      )
      return false
    }

    log.info('Successfully validated Plex token')
    return true
  } catch (err) {
    log.error({ error: err }, 'Failed to validate Plex token')
    return false
  }
}
