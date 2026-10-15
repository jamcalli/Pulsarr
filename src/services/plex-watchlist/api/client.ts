import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

const RATE_LIMITED = 429

/** Whether plex.tv accepted the token, rejected it, or could not be reached. */
export type PlexPingResult = 'accepted' | 'rejected' | 'unreachable'

export const pingPlex = async (
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexPingResult> => {
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
      return response.status === RATE_LIMITED || response.status >= 500
        ? 'unreachable'
        : 'rejected'
    }

    log.info('Successfully validated Plex token')
    return 'accepted'
  } catch (err) {
    log.error({ error: err }, 'Failed to validate Plex token')
    return 'unreachable'
  }
}
