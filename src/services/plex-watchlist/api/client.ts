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
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'pulsarr',
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

/**
 * Fetches the user's avatar URL from the Plex API, or returns null if unavailable.
 *
 * Attempts a GET to https://plex.tv/api/v2/user using the provided Plex token and
 * the module-wide timeout (PLEX_API_TIMEOUT_MS). On non-OK responses, network errors,
 * or when no avatar is present, the function returns `null`. Errors are logged
 * via the optional logger but are not thrown.
 *
 * @param token - Plex authentication token for the user
 * @returns The avatar URL string if found; otherwise `null`
 */
export async function fetchPlexAvatar(
  token: string,
  log?: FastifyBaseLogger,
): Promise<string | null> {
  try {
    // Plex.tv API endpoint for user account info
    const response = await fetch('https://plex.tv/api/v2/user', {
      headers: {
        'X-Plex-Token': token,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      return null
    }

    const userData = (await response.json()) as { thumb?: string }

    // Plex avatar URLs are typically in the format: https://plex.tv/users/{uuid}/avatar?c={timestamp}
    if (userData.thumb) {
      return userData.thumb
    }

    return null
  } catch (error) {
    // Log error but don't throw - we want graceful fallback
    // Use Pino/Fastify preferred style - error object first for proper serialization
    log?.warn(error as Error, 'Failed to fetch Plex avatar')
    return null
  }
}
